#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(projectRoot, "release", "release-manifest.json");
const evidenceValidator = path.join(projectRoot, "docs", "release-evidence", "validate-evidence.mjs");
const repositoryURL = "https://github.com/tenten-10-10/ps2-emu";
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

function git(...args) {
  return execFileSync("/usr/bin/git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function requireRegularFile(filePath, label) {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} is missing or is not a regular file: ${filePath}`);
  return stat;
}

async function requireExactRegularFiles(directory, expectedNames, label) {
  const stat = await fs.lstat(directory).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(`${label} directory is missing or unsafe: ${directory}`);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const actualNames = entries.map(({ name }) => name).sort();
  const wantedNames = [...expectedNames].sort();
  if (
    actualNames.length !== wantedNames.length
    || actualNames.some((name, index) => name !== wantedNames[index])
  ) {
    fail(`${label} must contain exactly: ${wantedNames.join(", ")}; found: ${actualNames.join(", ") || "none"}`);
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) fail(`${label} contains a non-regular entry: ${entry.name}`);
  }
}

function runEvidenceValidator(bundleRoot, evidencePath) {
  execFileSync(process.execPath, [evidenceValidator, "--require-pass", evidencePath], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      RELEASE_EVIDENCE_BUNDLE_ROOT: bundleRoot,
    },
  });
}

function publicArtifactSpecs(version) {
  return Object.freeze([
    Object.freeze({
      platformID: "macos-arm64",
      evidenceName: `${version}-macos-arm64.json`,
      artifactName: `PS2-Emu-${version}-launcher-macOS-arm64.dmg`,
    }),
    Object.freeze({
      platformID: "macos-x86_64",
      evidenceName: `${version}-macos-x86_64.json`,
      artifactName: `PS2-Emu-${version}-launcher-macOS-x86_64.dmg`,
    }),
    Object.freeze({
      platformID: "windows-x64",
      evidenceName: `${version}-windows-x64.json`,
      artifactName: `PS2-Emu-${version}-launcher-Windows-x64.zip`,
    }),
    Object.freeze({
      platformID: "windows-arm64",
      evidenceName: `${version}-windows-arm64.json`,
      artifactName: `PS2-Emu-${version}-launcher-Windows-ARM64.zip`,
    }),
  ]);
}

function publisherFromEvidence(record) {
  if (record.target.operatingSystem === "macOS") {
    return {
      identity: record.platformSecurity.macOS.developerIDApplication,
      teamIdentifier: record.platformSecurity.macOS.teamIdentifier,
      notarizationSubmissionID: record.platformSecurity.macOS.notarySubmissionID,
    };
  }
  return {
    identity: record.platformSecurity.windows.authenticodePublisher,
    signerCertificateSha256: record.platformSecurity.windows.signerCertificateSha256,
    timestampAuthority: record.platformSecurity.windows.timestampAuthority,
  };
}

async function writeIfAbsentOrIdentical(filePath, content) {
  const existing = await fs.readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing !== null) {
    if (existing !== content) fail(`Refusing to overwrite different prepared metadata: ${filePath}`);
    return "unchanged";
  }
  const temporary = `${filePath}.tmp-${crypto.randomUUID()}`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
  await fs.rename(temporary, filePath);
  return "created";
}

async function main() {
  const sourceRevision = process.env.SOURCE_REVISION ?? "";
  const configuredRoot = process.env.RELEASE_EVIDENCE_BUNDLE_ROOT ?? "";
  if (!SHA1.test(sourceRevision)) fail("SOURCE_REVISION must be the exact 40-character reviewed commit.");
  if (!path.isAbsolute(configuredRoot)) fail("RELEASE_EVIDENCE_BUNDLE_ROOT must be an absolute external directory.");

  const bundleRoot = path.resolve(configuredRoot);
  const relativeToProject = path.relative(projectRoot, bundleRoot);
  if (!relativeToProject || (!relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject))) {
    fail("RELEASE_EVIDENCE_BUNDLE_ROOT must remain outside the source repository.");
  }
  const bundleStat = await fs.lstat(bundleRoot).catch(() => null);
  if (!bundleStat?.isDirectory() || bundleStat.isSymbolicLink()) fail(`Release bundle root is missing or unsafe: ${bundleRoot}`);

  const head = git("rev-parse", "HEAD");
  if (head !== sourceRevision) fail(`SOURCE_REVISION does not match HEAD: source=${sourceRevision} head=${head}`);
  if (git("status", "--porcelain")) fail("Release preparation requires a clean source worktree.");
  execFileSync("/bin/sh", [path.join(scriptDirectory, "check-public-source-paths.sh"), sourceRevision], {
    cwd: projectRoot,
    stdio: ["ignore", "ignore", "inherit"],
  });

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const version = manifest?.product?.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) fail("Release manifest version is missing or invalid.");
  if (manifest.publicReleaseApproved !== false || manifest.gates?.downloadsEnabled !== false) {
    fail("Source release gates must remain fail-closed while a draft bundle is prepared.");
  }

  const specs = publicArtifactSpecs(version);
  const sourceArchiveName = `PS2-Emu-${version}-source.zip`;
  const sourceDirectory = path.join(bundleRoot, "source");
  const artifactDirectory = path.join(bundleRoot, "artifacts");
  const evidenceDirectory = path.join(bundleRoot, "evidence");
  await requireExactRegularFiles(sourceDirectory, [sourceArchiveName], "source");
  await requireExactRegularFiles(artifactDirectory, specs.map(({ artifactName }) => artifactName), "artifacts");
  await requireExactRegularFiles(evidenceDirectory, specs.map(({ evidenceName }) => evidenceName), "evidence");

  const sourcePath = path.join(sourceDirectory, sourceArchiveName);
  const sourceStat = await requireRegularFile(sourcePath, "source archive");
  const sourceSha256 = await sha256File(sourcePath);
  if (!SHA256.test(sourceSha256)) fail("Source archive hash calculation failed.");

  const artifactRecords = [];
  const completedTimes = [];
  for (const spec of specs) {
    const evidencePath = path.join(evidenceDirectory, spec.evidenceName);
    runEvidenceValidator(bundleRoot, evidencePath);
    const evidenceRaw = await fs.readFile(evidencePath, "utf8");
    const record = JSON.parse(evidenceRaw);
    if (record.target.platformID !== spec.platformID) fail(`${spec.evidenceName} target mismatch.`);
    if (record.source.revision !== sourceRevision) fail(`${spec.evidenceName} source revision mismatch.`);
    if (record.source.repositoryURL !== repositoryURL) fail(`${spec.evidenceName} repository mismatch.`);
    if (
      record.source.archive.name !== sourceArchiveName
      || record.source.archive.sizeBytes !== sourceStat.size
      || record.source.archive.sha256 !== sourceSha256
    ) fail(`${spec.evidenceName} source archive binding mismatch.`);
    if (record.finalArtifact.name !== spec.artifactName) fail(`${spec.evidenceName} public artifact name mismatch.`);

    const artifactPath = path.join(artifactDirectory, spec.artifactName);
    const artifactStat = await requireRegularFile(artifactPath, `${spec.platformID} artifact`);
    const artifactSha256 = await sha256File(artifactPath);
    if (
      record.finalArtifact.sizeBytes !== artifactStat.size
      || record.finalArtifact.sha256 !== artifactSha256
    ) fail(`${spec.evidenceName} final artifact binding mismatch.`);

    const evidenceSha256 = crypto.createHash("sha256").update(evidenceRaw).digest("hex");
    artifactRecords.push({
      platformID: spec.platformID,
      name: spec.artifactName,
      sizeBytes: artifactStat.size,
      sha256: artifactSha256,
      publisher: publisherFromEvidence(record),
      evidence: {
        name: spec.evidenceName,
        sha256: evidenceSha256,
      },
    });
    completedTimes.push(record.tester.completedAt);
  }

  const preparedAt = [...completedTimes].sort().at(-1);
  if (typeof preparedAt !== "string") fail("Completed evidence timestamps are missing.");
  const releaseRecord = {
    schemaVersion: 1,
    product: {
      name: manifest.product.name,
      version,
      build: manifest.product.build,
      license: manifest.product.license,
      copyrightHolder: manifest.product.copyrightHolder,
    },
    repositoryURL,
    source: {
      revisionAlgorithm: "git-sha1",
      revision: sourceRevision,
      archive: {
        name: sourceArchiveName,
        sizeBytes: sourceStat.size,
        sha256: sourceSha256,
      },
    },
    preparedAt,
    distributionMode: "external-core",
    artifacts: artifactRecords,
    gates: {
      allFourEvidenceRecordsPassed: true,
      exactArtifactBytesVerified: true,
      sourceRevisionBound: true,
      publicationPerformedByPreparation: false,
    },
  };

  const recordContent = `${JSON.stringify(releaseRecord, null, 2)}\n`;
  const recordPath = path.join(bundleRoot, "release-record.json");
  const recordStatus = await writeIfAbsentOrIdentical(recordPath, recordContent);
  const recordSha256 = await sha256File(recordPath);

  const checksumEntries = [
    [sourceSha256, sourceArchiveName],
    ...artifactRecords.map(({ sha256, name }) => [sha256, name]),
    ...artifactRecords.map(({ evidence }) => [evidence.sha256, evidence.name]),
    [recordSha256, "release-record.json"],
  ].sort((left, right) => left[1].localeCompare(right[1], "en"));
  const checksumContent = `${checksumEntries.map(([digest, name]) => `${digest}  ${name}`).join("\n")}\n`;
  const checksumsPath = path.join(bundleRoot, "CHECKSUMS.txt");
  const checksumsStatus = await writeIfAbsentOrIdentical(checksumsPath, checksumContent);

  console.log(`Prepared release bundle for PS2 Emu ${version}`);
  console.log(`Source revision: ${sourceRevision}`);
  console.log(`Evidence root: ${bundleRoot}`);
  console.log(`Artifacts: ${artifactRecords.length}`);
  console.log(`release-record.json: ${recordStatus}`);
  console.log(`CHECKSUMS.txt: ${checksumsStatus}`);
  console.log("Publication: not performed; prepared metadata remains draft-only.");
}

main().catch((error) => {
  console.error(`Release bundle preparation failed: ${error.message}`);
  process.exitCode = 1;
});
