import crypto from "node:crypto";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][0-9A-Za-z.-]+)?$/;

export const OFFICIAL_CORE_IDENTITY_FILES = Object.freeze([
  "Play.exe",
  "Qt5Core.dll",
  "Qt5Gui.dll",
  "Qt5Widgets.dll",
  "platforms/qwindows.dll",
  "styles/qwindowsvistastyle.dll",
  "imageformats/qjpeg.dll",
]);

function fail(message) {
  throw new Error(message);
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    fail(`${label} has unexpected or missing fields: ${actual.join(", ") || "none"}.`);
  }
}

function boundedString(value, label, maximum = 512) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)
  ) fail(`${label} must be a non-empty bounded printable string.`);
  return value;
}

function optionalBoundedString(value, label, maximum = 512) {
  if (value === null) return null;
  return boundedString(value, label, maximum);
}

function sha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function optionalSha256(value, label) {
  if (value === null) return null;
  return sha256(value, label);
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer.`);
  return value;
}

function canonicalFilePath(value, label) {
  const filePath = boundedString(value, label, 260);
  if (
    filePath.includes("\\")
    || filePath.startsWith("/")
    || /^[A-Za-z]:/.test(filePath)
    || filePath.split("/").some((component) => component === "" || component === "." || component === "..")
  ) fail(`${label} must be a canonical relative path using forward slashes.`);
  return filePath;
}

function validateIdentityFiles(files, label) {
  if (!Array.isArray(files)) fail(`${label} must be an array.`);
  const required = new Set(OFFICIAL_CORE_IDENTITY_FILES);
  const seen = new Set();
  const byPath = new Map();

  for (const [index, rawFile] of files.entries()) {
    const file = plainObject(rawFile, `${label}[${index}]`);
    exactKeys(file, ["path", "size", "sha256", "machine"], `${label}[${index}]`);
    const filePath = canonicalFilePath(file.path, `${label}[${index}].path`);
    if (!required.has(filePath)) fail(`${label} contains an unapproved identity path: ${filePath}.`);
    const caseKey = filePath.toLocaleLowerCase("en-US");
    if (seen.has(caseKey)) fail(`${label} contains a duplicate identity path: ${filePath}.`);
    seen.add(caseKey);
    if (file.machine !== "x64") fail(`${label}[${index}].machine must be x64.`);
    byPath.set(filePath, Object.freeze({
      path: filePath,
      size: positiveSafeInteger(file.size, `${label}[${index}].size`),
      sha256: sha256(file.sha256, `${label}[${index}].sha256`),
      machine: "x64",
    }));
  }

  const missing = OFFICIAL_CORE_IDENTITY_FILES.filter((filePath) => !byPath.has(filePath));
  if (missing.length > 0 || byPath.size !== OFFICIAL_CORE_IDENTITY_FILES.length) {
    fail(`${label} must contain exactly the required Play! and Qt identity files; missing: ${missing.join(", ") || "none"}.`);
  }
  return Object.freeze(OFFICIAL_CORE_IDENTITY_FILES.map((filePath) => byPath.get(filePath)));
}

function validateVerificationPolicy(value, label) {
  const policy = plainObject(value, label);
  exactKeys(
    policy,
    ["mode", "publisherVerified", "userConsentRequired", "warning"],
    label,
  );
  if (policy.mode !== "authenticode" && policy.mode !== "hash-only") {
    fail(`${label}.mode must be authenticode or hash-only.`);
  }
  if (policy.mode === "authenticode") {
    if (policy.publisherVerified !== true) fail(`${label}.publisherVerified must be true for authenticode.`);
    if (policy.userConsentRequired !== false) fail(`${label}.userConsentRequired must be false for authenticode.`);
    if (policy.warning !== null) fail(`${label}.warning must be null for authenticode.`);
  } else {
    if (policy.publisherVerified !== false) fail(`${label}.publisherVerified must be false for hash-only.`);
    if (policy.userConsentRequired !== true) fail(`${label}.userConsentRequired must be true for hash-only.`);
    const warning = boundedString(policy.warning, `${label}.warning`, 1024);
    if (!/publisher/i.test(warning) || !/unverified/i.test(warning) || !/unsigned/i.test(warning)) {
      fail(`${label}.warning must explicitly say that the unsigned publisher is unverified.`);
    }
  }
  return Object.freeze({
    mode: policy.mode,
    publisherVerified: policy.publisherVerified,
    userConsentRequired: policy.userConsentRequired,
    warning: policy.warning,
  });
}

function validateInstaller(value, label, release) {
  const installer = plainObject(value, label);
  exactKeys(installer, ["url", "size", "sha256"], label);
  const urlText = boundedString(installer.url, `${label}.url`, 2048);
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    fail(`${label}.url is not a valid URL.`);
  }
  const commonURLIsSafe = parsed.protocol === "https:"
    && !parsed.port
    && !parsed.username
    && !parsed.password
    && !parsed.search
    && !parsed.hash;
  if (!commonURLIsSafe) fail(`${label}.url must be a fixed credential-free HTTPS URL.`);

  if (release.verificationPolicy.mode === "hash-only") {
    const expectedPath = `/playbuilds/${release.upstreamCommit.slice(0, 8)}/Play-x86-64.exe`;
    if (parsed.hostname !== "s3.us-east-2.amazonaws.com" || parsed.pathname !== expectedPath) {
      fail(`${label}.url must be the exact official CI object for the approved upstream commit.`);
    }
  } else {
    const expectedPath = `/downloads/play/stable/${release.version}/Play-x86-64.exe`;
    if (parsed.hostname !== "purei.org" || parsed.pathname !== expectedPath) {
      fail(`${label}.url must be the exact versioned purei.org x64 installer URL.`);
    }
  }
  return Object.freeze({
    url: urlText,
    size: positiveSafeInteger(installer.size, `${label}.size`),
    sha256: sha256(installer.sha256, `${label}.sha256`),
  });
}

function validatePublisher(value, label, verificationPolicy) {
  const publisher = plainObject(value, label);
  exactKeys(publisher, ["status", "signerCertificateSha256", "subject"], label);
  const validated = Object.freeze({
    status: boundedString(publisher.status, `${label}.status`, 128),
    signerCertificateSha256: optionalSha256(
      publisher.signerCertificateSha256,
      `${label}.signerCertificateSha256`,
    ),
    subject: optionalBoundedString(publisher.subject, `${label}.subject`, 1024),
  });
  if (verificationPolicy.mode === "authenticode") {
    if (validated.status !== "Valid") fail(`${label}.status must be Valid for authenticode.`);
    if (!validated.signerCertificateSha256 || !validated.subject) {
      fail(`${label} must identify the Authenticode signer.`);
    }
  } else if (
    validated.status !== "NotSigned"
    || validated.signerCertificateSha256 !== null
    || validated.subject !== null
  ) {
    fail(`${label} must explicitly record NotSigned with no signer for hash-only approval.`);
  }
  return validated;
}

function validateVersionInfo(value, label) {
  const versionInfo = plainObject(value, label);
  exactKeys(
    versionInfo,
    ["productName", "productVersion", "fileVersion", "originalFilename", "registryDisplayVersion"],
    label,
  );
  return Object.freeze({
    productName: boundedString(versionInfo.productName, `${label}.productName`, 256),
    productVersion: boundedString(versionInfo.productVersion, `${label}.productVersion`, 128),
    fileVersion: boundedString(versionInfo.fileVersion, `${label}.fileVersion`, 128),
    originalFilename: boundedString(versionInfo.originalFilename, `${label}.originalFilename`, 256),
    registryDisplayVersion: boundedString(
      versionInfo.registryDisplayVersion,
      `${label}.registryDisplayVersion`,
      128,
    ),
  });
}

function validateRelease(value, index) {
  const label = `approvedReleases[${index}]`;
  const release = plainObject(value, label);
  exactKeys(
    release,
    [
      "id",
      "version",
      "upstreamCommit",
      "verificationPolicy",
      "sourceInstaller",
      "publisher",
      "versionInfo",
      "files",
    ],
    label,
  );
  const id = boundedString(release.id, `${label}.id`, 96);
  if (!ID_PATTERN.test(id)) fail(`${label}.id is invalid.`);
  const version = boundedString(release.version, `${label}.version`, 64);
  if (!VERSION_PATTERN.test(version)) fail(`${label}.version is invalid.`);
  if (typeof release.upstreamCommit !== "string" || !COMMIT_PATTERN.test(release.upstreamCommit)) {
    fail(`${label}.upstreamCommit must be a full lowercase Git commit SHA.`);
  }
  const partial = {
    id,
    version,
    upstreamCommit: release.upstreamCommit,
    verificationPolicy: validateVerificationPolicy(
      release.verificationPolicy,
      `${label}.verificationPolicy`,
    ),
  };
  return Object.freeze({
    ...partial,
    sourceInstaller: validateInstaller(release.sourceInstaller, `${label}.sourceInstaller`, partial),
    publisher: validatePublisher(release.publisher, `${label}.publisher`, partial.verificationPolicy),
    versionInfo: validateVersionInfo(release.versionInfo, `${label}.versionInfo`),
    files: validateIdentityFiles(release.files, `${label}.files`),
  });
}

export function parseOfficialCoreIdentityManifest(value) {
  const manifest = plainObject(value, "core identity manifest");
  exactKeys(
    manifest,
    ["schemaVersion", "approvalStatus", "blockReason", "approvedReleases"],
    "core identity manifest",
  );
  if (manifest.schemaVersion !== 2) fail("Unsupported core identity manifest schemaVersion.");
  if (manifest.approvalStatus !== "blocked" && manifest.approvalStatus !== "ready") {
    fail("core identity manifest approvalStatus must be blocked or ready.");
  }
  if (!Array.isArray(manifest.approvedReleases)) {
    fail("core identity manifest approvedReleases must be an array.");
  }
  const releases = Object.freeze(manifest.approvedReleases.map(validateRelease));
  const ids = new Set();
  const executableHashes = new Set();
  for (const release of releases) {
    if (ids.has(release.id)) fail(`Duplicate approved release id: ${release.id}.`);
    ids.add(release.id);
    const playHash = release.files[0].sha256;
    if (executableHashes.has(playHash)) fail(`Duplicate approved Play.exe SHA-256: ${playHash}.`);
    executableHashes.add(playHash);
  }

  let blockReason;
  if (manifest.approvalStatus === "blocked") {
    blockReason = boundedString(manifest.blockReason, "core identity manifest blockReason", 1024);
    if (releases.length !== 0) fail("A blocked core identity manifest cannot approve releases.");
  } else {
    if (manifest.blockReason !== null) fail("A ready core identity manifest must have a null blockReason.");
    if (releases.length === 0) fail("A ready core identity manifest must approve at least one release.");
    blockReason = null;
  }

  return Object.freeze({
    schemaVersion: 2,
    approvalStatus: manifest.approvalStatus,
    blockReason,
    approvedReleases: releases,
  });
}

function validatedEvidence(value) {
  const evidence = plainObject(value, "core identity evidence");
  exactKeys(
    evidence,
    ["schemaVersion", "installRoot", "registryDisplayVersion", "publisher", "versionInfo", "files"],
    "core identity evidence",
  );
  if (evidence.schemaVersion !== 1) fail("Unsupported core identity evidence schemaVersion.");
  const publisher = plainObject(evidence.publisher, "core identity evidence publisher");
  exactKeys(
    publisher,
    ["status", "signerCertificateSha256", "subject"],
    "core identity evidence publisher",
  );
  const versionInfo = plainObject(evidence.versionInfo, "core identity evidence versionInfo");
  exactKeys(
    versionInfo,
    ["productName", "productVersion", "fileVersion", "originalFilename"],
    "core identity evidence versionInfo",
  );
  return Object.freeze({
    schemaVersion: 1,
    installRoot: boundedString(evidence.installRoot, "core identity evidence installRoot", 32_767),
    registryDisplayVersion: optionalBoundedString(
      evidence.registryDisplayVersion,
      "core identity evidence registryDisplayVersion",
      128,
    ),
    publisher: Object.freeze({
      status: boundedString(publisher.status, "core identity evidence publisher.status", 128),
      signerCertificateSha256: optionalSha256(
        publisher.signerCertificateSha256,
        "core identity evidence publisher.signerCertificateSha256",
      ),
      subject: optionalBoundedString(
        publisher.subject,
        "core identity evidence publisher.subject",
        1024,
      ),
    }),
    versionInfo: Object.freeze({
      productName: optionalBoundedString(
        versionInfo.productName,
        "core identity evidence versionInfo.productName",
        256,
      ),
      productVersion: optionalBoundedString(
        versionInfo.productVersion,
        "core identity evidence versionInfo.productVersion",
        128,
      ),
      fileVersion: optionalBoundedString(
        versionInfo.fileVersion,
        "core identity evidence versionInfo.fileVersion",
        128,
      ),
      originalFilename: optionalBoundedString(
        versionInfo.originalFilename,
        "core identity evidence versionInfo.originalFilename",
        256,
      ),
    }),
    files: validateIdentityFiles(evidence.files, "core identity evidence files"),
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the approved release.`);
}

function releaseIdentityKey(release) {
  const payload = {
    schemaVersion: 2,
    releaseID: release.id,
    version: release.version,
    upstreamCommit: release.upstreamCommit,
    verificationPolicy: {
      mode: release.verificationPolicy.mode,
      publisherVerified: release.verificationPolicy.publisherVerified,
      userConsentRequired: release.verificationPolicy.userConsentRequired,
      warning: release.verificationPolicy.warning,
    },
    sourceInstaller: { ...release.sourceInstaller },
    publisher: { ...release.publisher },
    versionInfo: { ...release.versionInfo },
    files: release.files.map(({ path: filePath, size, sha256: digest, machine }) => ({
      path: filePath,
      size,
      sha256: digest,
      machine,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function verifyOfficialCoreIdentity(evidenceValue, manifestValue) {
  const manifest = parseOfficialCoreIdentityManifest(manifestValue);
  if (manifest.approvalStatus !== "ready") {
    fail(`Official Play! identity verification is blocked: ${manifest.blockReason}`);
  }
  const evidence = validatedEvidence(evidenceValue);
  const playHash = evidence.files[0].sha256;
  const release = manifest.approvedReleases.find((candidate) => candidate.files[0].sha256 === playHash);
  if (!release) fail(`Play.exe SHA-256 is not approved: ${playHash}.`);

  assertEqual(evidence.publisher.status, release.publisher.status, "Authenticode status");
  assertEqual(
    evidence.publisher.signerCertificateSha256,
    release.publisher.signerCertificateSha256,
    "Authenticode signer certificate SHA-256",
  );
  assertEqual(evidence.publisher.subject, release.publisher.subject, "Authenticode subject");
  assertEqual(
    evidence.registryDisplayVersion,
    release.versionInfo.registryDisplayVersion,
    "registry DisplayVersion",
  );
  for (const field of ["productName", "productVersion", "fileVersion", "originalFilename"]) {
    assertEqual(evidence.versionInfo[field], release.versionInfo[field], `Play.exe ${field}`);
  }
  for (let index = 0; index < OFFICIAL_CORE_IDENTITY_FILES.length; index += 1) {
    const actual = evidence.files[index];
    const expected = release.files[index];
    assertEqual(actual.path, expected.path, `${expected.path} path`);
    assertEqual(actual.size, expected.size, `${expected.path} size`);
    assertEqual(actual.sha256, expected.sha256, `${expected.path} SHA-256`);
    assertEqual(actual.machine, expected.machine, `${expected.path} PE machine`);
  }

  return Object.freeze({
    releaseID: release.id,
    version: release.version,
    upstreamCommit: release.upstreamCommit,
    playSha256: playHash,
    verificationMode: release.verificationPolicy.mode,
    publisherVerified: release.verificationPolicy.publisherVerified,
    userConsentRequired: release.verificationPolicy.userConsentRequired,
    warning: release.verificationPolicy.warning,
    publisherSubject: release.publisher.subject,
    identityKey: releaseIdentityKey(release),
  });
}
