import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SOURCE_REVISION_BINDING_METHOD = "cms-signed-release-binding-v1";
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PLATFORM_IDS = new Set(["windows-x64", "windows-arm64"]);
const EXACT_KEYS = Object.freeze([
  "schemaVersion", "bindingMethod", "product", "version", "platformID",
  "sourceRevisionAlgorithm", "sourceRevision", "finalArtifactName",
  "finalArtifactSizeBytes", "finalArtifactSha256", "signerCertificateSha256",
]);

function fail(message) {
  throw new Error(message);
}

function runOpenSSL(argumentsList) {
  const executable = process.env.PS2_OPENSSL_PATH || (process.platform === "win32" ? "" : "/usr/bin/openssl");
  if (!path.isAbsolute(executable)) fail("PS2_OPENSSL_PATH must name a trusted absolute OpenSSL executable.");
  let executableStat;
  try {
    executableStat = fsSync.lstatSync(executable);
  } catch {
    fail("PS2_OPENSSL_PATH does not exist.");
  }
  if (!executableStat.isFile() || executableStat.isSymbolicLink()) {
    fail("PS2_OPENSSL_PATH must name a regular non-symlink OpenSSL executable.");
  }
  const result = spawnSync(executable, argumentsList, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) fail(`OpenSSL could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`OpenSSL CMS verification failed: ${(result.stderr || result.stdout).trim() || `exit ${result.status}`}`);
  return result.stdout;
}

function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Signed source binding content must be a JSON object.");
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...EXACT_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail(`Signed source binding has unexpected or missing fields: ${actualKeys.join(", ") || "none"}.`);
  }
  if (value.schemaVersion !== 1) fail("Signed source binding schemaVersion must equal 1.");
  if (value.bindingMethod !== SOURCE_REVISION_BINDING_METHOD) fail(`Signed source binding method must equal ${SOURCE_REVISION_BINDING_METHOD}.`);
  if (value.product !== "PS2 Emu") fail("Signed source binding product must equal PS2 Emu.");
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.version)) fail("Signed source binding version is invalid.");
  if (!PLATFORM_IDS.has(value.platformID)) fail("Signed source binding platformID is unsupported.");
  if (value.sourceRevisionAlgorithm !== "git-sha1" || !SHA1.test(value.sourceRevision)) fail("Signed source binding must contain an exact lowercase Git SHA-1.");
  if (typeof value.finalArtifactName !== "string" || path.basename(value.finalArtifactName) !== value.finalArtifactName || !value.finalArtifactName.endsWith(".zip")) fail("Signed source binding finalArtifactName must be a plain ZIP filename.");
  if (!Number.isSafeInteger(value.finalArtifactSizeBytes) || value.finalArtifactSizeBytes <= 0) fail("Signed source binding finalArtifactSizeBytes is invalid.");
  if (!SHA256.test(value.finalArtifactSha256)) fail("Signed source binding finalArtifactSha256 is invalid.");
  if (!SHA256.test(value.signerCertificateSha256)) fail("Signed source binding signerCertificateSha256 is invalid.");
  return Object.freeze(value);
}

export async function verifyCmsSignedReleaseBinding(signedEvidencePath, expected = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-source-binding-"));
  const contentPath = path.join(directory, "content.json");
  const signerPath = path.join(directory, "signer.pem");
  try {
    const stat = await fs.lstat(signedEvidencePath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size === 0) fail("Signed source binding must be a non-empty regular file.");
    runOpenSSL(["cms", "-verify", "-inform", "DER", "-binary", "-noverify", "-in", signedEvidencePath, "-out", contentPath, "-signer", signerPath]);
    const signerPem = await fs.readFile(signerPath, "utf8");
    if ((signerPem.match(/-----BEGIN CERTIFICATE-----/g) || []).length !== 1) fail("Signed source binding must contain exactly one signer certificate.");
    const fingerprintOutput = runOpenSSL(["x509", "-in", signerPath, "-noout", "-fingerprint", "-sha256"]);
    const match = /Fingerprint=([0-9A-F:]{95})\s*$/im.exec(fingerprintOutput);
    if (!match) fail("OpenSSL did not report the CMS signer certificate SHA-256 fingerprint.");
    const signerCertificateSha256 = match[1].replaceAll(":", "").toLowerCase();
    const rawContent = await fs.readFile(contentPath);
    if (rawContent.length === 0 || rawContent.at(-1) !== 0x0a || rawContent.includes(0x0d)) fail("Signed source binding content must be canonical UTF-8 JSON with one LF terminator.");
    let parsed;
    try {
      parsed = JSON.parse(rawContent.toString("utf8"));
    } catch (error) {
      fail(`Signed source binding content is not valid UTF-8 JSON: ${error.message}`);
    }
    const manifest = validateManifest(parsed);
    if (!rawContent.equals(Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8"))) fail("Signed source binding content is not the canonical JSON encoding.");
    if (manifest.signerCertificateSha256 !== signerCertificateSha256) fail("Signed source binding certificate fingerprint does not match its CMS signer.");
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (expectedValue !== undefined && manifest[field] !== expectedValue) fail(`Signed source binding ${field} mismatch: expected ${expectedValue}, found ${manifest[field]}.`);
    }
    return Object.freeze({ manifest, signerCertificateSha256 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
