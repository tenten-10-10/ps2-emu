import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SOURCE_REVISION_BINDING_METHOD, verifyCmsSignedReleaseBinding } from "../scripts/lib/source-revision-binding.mjs";

const REVISION = "aca4e9f4a2cdf225a695f8b7beaa6c5cf3fa6892";
const ARTIFACT_SHA = "ab".repeat(32);
const OPENSSL = process.env.PS2_OPENSSL_PATH || (process.platform === "win32" ? "openssl" : "/usr/bin/openssl");

async function withSignedBinding(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-binding-test-"));
  const key = path.join(directory, "key.pem");
  const certificate = path.join(directory, "certificate.pem");
  const content = path.join(directory, "content.json");
  const signed = path.join(directory, "binding.p7m");
  try {
    execFileSync(OPENSSL, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=PS2 Emu Test/", "-days", "1", "-keyout", key, "-out", certificate], { stdio: "ignore" });
    const fingerprint = execFileSync(OPENSSL, ["x509", "-in", certificate, "-noout", "-fingerprint", "-sha256"], { encoding: "utf8" })
      .match(/Fingerprint=([0-9A-F:]{95})/i)[1].replaceAll(":", "").toLowerCase();
    const manifest = {
      schemaVersion: 1,
      bindingMethod: SOURCE_REVISION_BINDING_METHOD,
      product: "PS2 Emu",
      version: "0.1.0",
      platformID: "windows-x64",
      sourceRevisionAlgorithm: "git-sha1",
      sourceRevision: REVISION,
      finalArtifactName: "PS2-Emu-0.1.0-launcher-Windows-x64.zip",
      finalArtifactSizeBytes: 12345,
      finalArtifactSha256: ARTIFACT_SHA,
      signerCertificateSha256: fingerprint,
    };
    await fs.writeFile(content, `${JSON.stringify(manifest)}\n`);
    execFileSync(OPENSSL, ["cms", "-sign", "-binary", "-nodetach", "-in", content, "-signer", certificate, "-inkey", key, "-outform", "DER", "-out", signed], { stdio: "ignore" });
    await callback({ directory, signed, manifest, fingerprint });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("CMS signature authenticates the canonical source and final artifact binding", async () => {
  await withSignedBinding(async ({ signed, manifest, fingerprint }) => {
    const result = await verifyCmsSignedReleaseBinding(signed, {
      sourceRevision: REVISION,
      finalArtifactName: manifest.finalArtifactName,
      finalArtifactSizeBytes: manifest.finalArtifactSizeBytes,
      finalArtifactSha256: ARTIFACT_SHA,
      signerCertificateSha256: fingerprint,
    });
    assert.deepEqual(result.manifest, manifest);
    assert.equal(result.signerCertificateSha256, fingerprint);
  });
});

test("tampered CMS, substituted revision, artifact hash, and signer pin fail closed", async () => {
  await withSignedBinding(async ({ directory, signed, fingerprint }) => {
    const tampered = path.join(directory, "tampered.p7m");
    const bytes = await fs.readFile(signed);
    bytes[Math.floor(bytes.length / 2)] ^= 1;
    await fs.writeFile(tampered, bytes);
    await assert.rejects(verifyCmsSignedReleaseBinding(tampered), /CMS verification failed/);
    await assert.rejects(verifyCmsSignedReleaseBinding(signed, { sourceRevision: "0".repeat(40) }), /sourceRevision mismatch/);
    await assert.rejects(verifyCmsSignedReleaseBinding(signed, { finalArtifactSha256: "cd".repeat(32) }), /finalArtifactSha256 mismatch/);
    await assert.rejects(verifyCmsSignedReleaseBinding(signed, { signerCertificateSha256: "ef".repeat(32) }), /signerCertificateSha256 mismatch/);
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
  });
});

test("non-canonical signed JSON is rejected even with a valid CMS signature", async () => {
  await withSignedBinding(async ({ directory, signed }) => {
    const content = path.join(directory, "pretty.json");
    const alternate = path.join(directory, "pretty.p7m");
    const decoded = path.join(directory, "decoded.json");
    execFileSync(OPENSSL, ["cms", "-verify", "-inform", "DER", "-binary", "-noverify", "-in", signed, "-out", decoded], { stdio: "ignore" });
    const manifest = JSON.parse(await fs.readFile(decoded, "utf8"));
    await fs.writeFile(content, `${JSON.stringify(manifest, null, 2)}\n`);
    execFileSync(OPENSSL, ["cms", "-sign", "-binary", "-nodetach", "-in", content, "-signer", path.join(directory, "certificate.pem"), "-inkey", path.join(directory, "key.pem"), "-outform", "DER", "-out", alternate], { stdio: "ignore" });
    await assert.rejects(verifyCmsSignedReleaseBinding(alternate), /canonical JSON encoding/);
  });
});
