#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const schemaPath = path.join(scriptDirectory, "release-evidence.schema.json");
const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const RESULT_VALUES = new Set(["not-run", "pass", "fail", "blocked", "not-applicable"]);

const TARGETS = Object.freeze({
  "macos-arm64": Object.freeze({
    operatingSystem: "macOS",
    launcherArchitecture: "arm64",
    coreArchitecture: "arm64",
    compatibilityMode: "native",
    extension: ".dmg",
    identityMode: "strict-developer-id",
  }),
  "macos-x86_64": Object.freeze({
    operatingSystem: "macOS",
    launcherArchitecture: "x86_64",
    coreArchitecture: "x86_64",
    compatibilityMode: "native",
    extension: ".dmg",
    identityMode: "strict-developer-id",
  }),
  "windows-x64": Object.freeze({
    operatingSystem: "Windows",
    launcherArchitecture: "x64",
    coreArchitecture: "x64",
    compatibilityMode: "native",
    extension: ".zip",
    identityMode: "hash-only",
  }),
  "windows-arm64": Object.freeze({
    operatingSystem: "Windows",
    launcherArchitecture: "arm64",
    coreArchitecture: "x64",
    compatibilityMode: "windows-x64-emulation",
    extension: ".zip",
    identityMode: "hash-only",
  }),
});

const CHECK_PATHS = Object.freeze([
  "sourceBinding.verification",
  "functionalTests.externalCoreDiscovery",
  "functionalTests.launch",
  "functionalTests.graphics",
  "functionalTests.audio",
  "functionalTests.controller",
  "functionalTests.save",
  "functionalTests.stop",
  "functionalTests.relaunch",
  "systemTests.standardUser",
  "systemTests.removal",
  "systemTests.wrapperNetworkSilence",
  "externalPlay.validation",
]);

function usage() {
  console.error(`Usage:
  node ${path.basename(import.meta.filename)} --template <template.json> [...]
  node ${path.basename(import.meta.filename)} --completed <evidence.json> [...]
  node ${path.basename(import.meta.filename)} --require-pass <evidence.json> [...]

--completed accepts truthful pass, fail, or blocked observations.
--require-pass additionally requires every release gate to pass and requires
RELEASE_EVIDENCE_BUNDLE_ROOT to contain source/, artifacts/, and attachments.`);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAt(record, dottedPath) {
  return dottedPath.split(".").reduce((value, component) => value?.[component], record);
}

function add(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function exactKeys(errors, value, expected, location) {
  if (!isObject(value)) {
    add(errors, location, "must be an object");
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    add(errors, location, `unexpected or missing fields; found ${actual.join(", ") || "none"}`);
    return false;
  }
  return true;
}

function nullableString(errors, value, location, maximum = 2000) {
  if (value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    add(errors, location, "must be null or a non-empty bounded printable string");
  }
}

function nullablePositiveInteger(errors, value, location) {
  if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
    add(errors, location, "must be null or a positive safe integer");
  }
}

function nullableBoolean(errors, value, location) {
  if (value !== null && typeof value !== "boolean") add(errors, location, "must be null or boolean");
}

function nullableSha256(errors, value, location) {
  if (value !== null && (typeof value !== "string" || !SHA256.test(value))) {
    add(errors, location, "must be null or a lowercase SHA-256 digest");
  }
}

function nullableDateTime(errors, value, location) {
  if (value === null) return;
  if (typeof value !== "string" || !DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    add(errors, location, "must be null or an RFC 3339 timestamp with an explicit timezone");
  }
}

function nullableHttpsURL(errors, value, location) {
  if (value === null) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
  } catch {
    add(errors, location, "must be null or a credential-free HTTPS URL");
  }
}

function checkShape(errors, value, location) {
  if (!exactKeys(errors, value, ["result", "notes"], location)) return;
  if (!RESULT_VALUES.has(value.result)) add(errors, `${location}.result`, "has an unsupported result value");
  nullableString(errors, value.notes, `${location}.notes`);
}

function checkRecordShape(record, errors) {
  if (!exactKeys(errors, record, [
    "schemaVersion", "recordState", "product", "source", "finalArtifact", "sourceBinding", "target", "download",
    "platformSecurity", "externalPlay", "functionalTests", "systemTests", "tester", "attestation",
    "attachments", "failures",
  ], "$")) return;

  if (record.schemaVersion !== 1) add(errors, "schemaVersion", "must equal 1");
  if (record.recordState !== "template" && record.recordState !== "completed") {
    add(errors, "recordState", "must be template or completed");
  }

  if (exactKeys(errors, record.product, ["name", "version"], "product")) {
    if (record.product.name !== "PS2 Emu") add(errors, "product.name", "must equal PS2 Emu");
    if (typeof record.product.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(record.product.version)) {
      add(errors, "product.version", "must be a semantic release version");
    }
  }

  if (exactKeys(errors, record.source, ["repositoryURL", "revisionAlgorithm", "revision", "archive"], "source")) {
    if (record.source.repositoryURL !== "https://github.com/tenten-10-10/ps2-emu") {
      add(errors, "source.repositoryURL", "must name the public PS2 Emu repository");
    }
    if (!new Set(["git-sha1", "git-sha256"]).has(record.source.revisionAlgorithm)) {
      add(errors, "source.revisionAlgorithm", "must be git-sha1 or git-sha256");
    }
    if (record.source.revision !== null) {
      const expectedPattern = record.source.revisionAlgorithm === "git-sha256" ? SHA256 : SHA1;
      if (typeof record.source.revision !== "string" || !expectedPattern.test(record.source.revision)) {
        add(errors, "source.revision", `does not match ${record.source.revisionAlgorithm}`);
      }
    }
    if (exactKeys(errors, record.source.archive, ["name", "sizeBytes", "sha256"], "source.archive")) {
      nullableString(errors, record.source.archive.name, "source.archive.name", 256);
      nullablePositiveInteger(errors, record.source.archive.sizeBytes, "source.archive.sizeBytes");
      nullableSha256(errors, record.source.archive.sha256, "source.archive.sha256");
    }
  }

  if (exactKeys(errors, record.finalArtifact, ["name", "sizeBytes", "sha256"], "finalArtifact")) {
    nullableString(errors, record.finalArtifact.name, "finalArtifact.name", 256);
    nullablePositiveInteger(errors, record.finalArtifact.sizeBytes, "finalArtifact.sizeBytes");
    nullableSha256(errors, record.finalArtifact.sha256, "finalArtifact.sha256");
  }

  if (exactKeys(errors, record.sourceBinding, ["artifactReportedRevision", "verification", "rawEvidenceSha256"], "sourceBinding")) {
    if (record.sourceBinding.artifactReportedRevision !== null) {
      const expectedPattern = record.source?.revisionAlgorithm === "git-sha256" ? SHA256 : SHA1;
      if (typeof record.sourceBinding.artifactReportedRevision !== "string" || !expectedPattern.test(record.sourceBinding.artifactReportedRevision)) {
        add(errors, "sourceBinding.artifactReportedRevision", `does not match ${record.source?.revisionAlgorithm || "the source revision algorithm"}`);
      }
    }
    checkShape(errors, record.sourceBinding.verification, "sourceBinding.verification");
    nullableSha256(errors, record.sourceBinding.rawEvidenceSha256, "sourceBinding.rawEvidenceSha256");
  }

  if (exactKeys(errors, record.target, [
    "platformID", "operatingSystem", "launcherArchitecture", "coreArchitecture", "compatibilityMode",
    "minimumOS", "observedOSVersion", "observedOSBuild", "hardware",
  ], "target")) {
    const target = TARGETS[record.target.platformID];
    if (!target) {
      add(errors, "target.platformID", "is not a supported release target");
    } else {
      for (const field of ["operatingSystem", "launcherArchitecture", "coreArchitecture", "compatibilityMode"]) {
        if (record.target[field] !== target[field]) add(errors, `target.${field}`, `must equal ${target[field]} for ${record.target.platformID}`);
      }
    }
    nullableString(errors, record.target.minimumOS, "target.minimumOS", 128);
    nullableString(errors, record.target.observedOSVersion, "target.observedOSVersion", 256);
    nullableString(errors, record.target.observedOSBuild, "target.observedOSBuild", 256);
    if (exactKeys(errors, record.target.hardware, ["manufacturer", "model", "cpuOrSoC", "memoryGiB", "physicalMachine"], "target.hardware")) {
      for (const field of ["manufacturer", "model", "cpuOrSoC"]) nullableString(errors, record.target.hardware[field], `target.hardware.${field}`, 256);
      nullablePositiveInteger(errors, record.target.hardware.memoryGiB, "target.hardware.memoryGiB");
      nullableBoolean(errors, record.target.hardware.physicalMachine, "target.hardware.physicalMachine");
    }
  }

  if (exactKeys(errors, record.download, [
    "browserName", "browserVersion", "url", "downloadedAt", "downloadedSha256", "quarantineOrMarkOfWebPresent",
  ], "download")) {
    nullableString(errors, record.download.browserName, "download.browserName", 256);
    nullableString(errors, record.download.browserVersion, "download.browserVersion", 256);
    nullableHttpsURL(errors, record.download.url, "download.url");
    nullableDateTime(errors, record.download.downloadedAt, "download.downloadedAt");
    nullableSha256(errors, record.download.downloadedSha256, "download.downloadedSha256");
    nullableBoolean(errors, record.download.quarantineOrMarkOfWebPresent, "download.quarantineOrMarkOfWebPresent");
  }

  if (exactKeys(errors, record.platformSecurity, ["macOS", "windows"], "platformSecurity")) {
    if (record.platformSecurity.macOS !== null) {
      const mac = record.platformSecurity.macOS;
      if (exactKeys(errors, mac, [
        "developerIDApplication", "teamIdentifier", "appCodeSignature", "hardenedRuntime", "secureTimestamp",
        "getTaskAllowAbsent", "dmgCodeSignature", "notarizationStatus", "notarySubmissionID", "notaryLogSha256",
        "stapledTicket", "gatekeeper", "securityBypassUsed",
      ], "platformSecurity.macOS")) {
        nullableString(errors, mac.developerIDApplication, "platformSecurity.macOS.developerIDApplication", 256);
        nullableString(errors, mac.teamIdentifier, "platformSecurity.macOS.teamIdentifier", 256);
        checkShape(errors, mac.appCodeSignature, "platformSecurity.macOS.appCodeSignature");
        nullableBoolean(errors, mac.hardenedRuntime, "platformSecurity.macOS.hardenedRuntime");
        nullableBoolean(errors, mac.secureTimestamp, "platformSecurity.macOS.secureTimestamp");
        nullableBoolean(errors, mac.getTaskAllowAbsent, "platformSecurity.macOS.getTaskAllowAbsent");
        checkShape(errors, mac.dmgCodeSignature, "platformSecurity.macOS.dmgCodeSignature");
        if (mac.notarizationStatus !== null && !new Set(["Accepted", "Invalid", "Rejected"]).has(mac.notarizationStatus)) {
          add(errors, "platformSecurity.macOS.notarizationStatus", "has an unsupported value");
        }
        if (mac.notarySubmissionID !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mac.notarySubmissionID)) {
          add(errors, "platformSecurity.macOS.notarySubmissionID", "must be a UUID");
        }
        nullableSha256(errors, mac.notaryLogSha256, "platformSecurity.macOS.notaryLogSha256");
        checkShape(errors, mac.stapledTicket, "platformSecurity.macOS.stapledTicket");
        checkShape(errors, mac.gatekeeper, "platformSecurity.macOS.gatekeeper");
        nullableBoolean(errors, mac.securityBypassUsed, "platformSecurity.macOS.securityBypassUsed");
      }
    }
    if (record.platformSecurity.windows !== null) {
      const windows = record.platformSecurity.windows;
      if (exactKeys(errors, windows, [
        "authenticodePublisher", "signerCertificateSha256", "signtoolVerification", "timestampAuthority",
        "timestampVerification", "defender", "smartScreen", "smartAppControl", "securityBypassUsed",
      ], "platformSecurity.windows")) {
        nullableString(errors, windows.authenticodePublisher, "platformSecurity.windows.authenticodePublisher", 256);
        nullableSha256(errors, windows.signerCertificateSha256, "platformSecurity.windows.signerCertificateSha256");
        for (const field of ["signtoolVerification", "timestampVerification", "defender", "smartScreen", "smartAppControl"]) {
          checkShape(errors, windows[field], `platformSecurity.windows.${field}`);
        }
        nullableString(errors, windows.timestampAuthority, "platformSecurity.windows.timestampAuthority", 256);
        nullableBoolean(errors, windows.securityBypassUsed, "platformSecurity.windows.securityBypassUsed");
      }
    }
  }

  if (exactKeys(errors, record.externalPlay, [
    "delivery", "expectedVersion", "expectedUpstreamCommit", "observedVersion", "acquisitionURL",
    "installerSha256", "executableSha256", "codeDirectoryHash", "requiredFileSetEvidenceSha256",
    "identityMode", "identityKey", "publisherStatus", "publisherVerified", "validation", "rawEvidenceSha256", "notes",
  ], "externalPlay")) {
    if (record.externalPlay.delivery !== "external-official-installation") add(errors, "externalPlay.delivery", "must remain external-official-installation");
    if (record.externalPlay.expectedVersion !== "0.77-7-g04bde0df") add(errors, "externalPlay.expectedVersion", "unexpected pinned version");
    if (record.externalPlay.expectedUpstreamCommit !== "04bde0df87ee7c0e2f0151b51bb2cc22c88541da") add(errors, "externalPlay.expectedUpstreamCommit", "unexpected upstream commit");
    nullableString(errors, record.externalPlay.observedVersion, "externalPlay.observedVersion", 256);
    nullableHttpsURL(errors, record.externalPlay.acquisitionURL, "externalPlay.acquisitionURL");
    for (const field of ["installerSha256", "executableSha256", "requiredFileSetEvidenceSha256", "identityKey", "rawEvidenceSha256"]) {
      nullableSha256(errors, record.externalPlay[field], `externalPlay.${field}`);
    }
    if (record.externalPlay.codeDirectoryHash !== null && !/^[0-9a-f]{40,64}$/.test(record.externalPlay.codeDirectoryHash)) {
      add(errors, "externalPlay.codeDirectoryHash", "must be null or a lowercase code-directory digest");
    }
    if (!new Set(["strict-developer-id", "hash-only"]).has(record.externalPlay.identityMode)) add(errors, "externalPlay.identityMode", "is unsupported");
    nullableString(errors, record.externalPlay.publisherStatus, "externalPlay.publisherStatus", 256);
    nullableBoolean(errors, record.externalPlay.publisherVerified, "externalPlay.publisherVerified");
    checkShape(errors, record.externalPlay.validation, "externalPlay.validation");
    nullableString(errors, record.externalPlay.notes, "externalPlay.notes");
  }

  if (exactKeys(errors, record.functionalTests, [
    "fixture", "externalCoreDiscovery", "launch", "graphics", "audio", "controller", "save", "stop", "relaunch",
  ], "functionalTests")) {
    if (exactKeys(errors, record.functionalTests.fixture, ["name", "kind", "sha256", "sourceURL", "legalBasis"], "functionalTests.fixture")) {
      nullableString(errors, record.functionalTests.fixture.name, "functionalTests.fixture.name", 256);
      if (record.functionalTests.fixture.kind !== null && !new Set(["homebrew-elf", "user-owned-game-image"]).has(record.functionalTests.fixture.kind)) {
        add(errors, "functionalTests.fixture.kind", "is unsupported");
      }
      nullableSha256(errors, record.functionalTests.fixture.sha256, "functionalTests.fixture.sha256");
      nullableHttpsURL(errors, record.functionalTests.fixture.sourceURL, "functionalTests.fixture.sourceURL");
      nullableString(errors, record.functionalTests.fixture.legalBasis, "functionalTests.fixture.legalBasis");
    }
    for (const field of ["externalCoreDiscovery", "launch", "graphics", "audio", "controller", "save", "stop", "relaunch"]) {
      checkShape(errors, record.functionalTests[field], `functionalTests.${field}`);
    }
  }

  if (exactKeys(errors, record.systemTests, ["standardUser", "removal", "wrapperNetworkSilence"], "systemTests")) {
    for (const field of ["standardUser", "removal", "wrapperNetworkSilence"]) checkShape(errors, record.systemTests[field], `systemTests.${field}`);
  }

  if (exactKeys(errors, record.tester, ["alias", "role", "startedAt", "completedAt", "timezone", "notes"], "tester")) {
    nullableString(errors, record.tester.alias, "tester.alias", 256);
    nullableString(errors, record.tester.role, "tester.role", 256);
    nullableDateTime(errors, record.tester.startedAt, "tester.startedAt");
    nullableDateTime(errors, record.tester.completedAt, "tester.completedAt");
    nullableString(errors, record.tester.timezone, "tester.timezone", 128);
    nullableString(errors, record.tester.notes, "tester.notes");
    if (typeof record.tester.alias === "string" && record.tester.alias.includes("@")) add(errors, "tester.alias", "must be a non-email alias");
  }

  if (exactKeys(errors, record.attestation, ["observedOnNamedHardware", "finalArtifactHashMatched", "valuesRecordedWithoutFabrication"], "attestation")) {
    for (const field of ["observedOnNamedHardware", "finalArtifactHashMatched", "valuesRecordedWithoutFabrication"]) {
      nullableBoolean(errors, record.attestation[field], `attestation.${field}`);
    }
  }

  if (!Array.isArray(record.attachments)) {
    add(errors, "attachments", "must be an array");
  } else {
    for (const [index, attachment] of record.attachments.entries()) {
      const location = `attachments[${index}]`;
      if (!exactKeys(errors, attachment, ["relativePath", "sha256", "mediaType", "description"], location)) continue;
      if (
        typeof attachment.relativePath !== "string"
        || !attachment.relativePath
        || attachment.relativePath.includes("\\")
        || attachment.relativePath.startsWith("/")
        || /^[A-Za-z]:/.test(attachment.relativePath)
        || attachment.relativePath.split("/").some((component) => !component || component === "." || component === "..")
        || !attachment.relativePath.startsWith("attachments/")
      ) add(errors, `${location}.relativePath`, "must be a safe bundle-relative path using forward slashes");
      if (typeof attachment.sha256 !== "string" || !SHA256.test(attachment.sha256)) add(errors, `${location}.sha256`, "must be a lowercase SHA-256 digest");
      nullableString(errors, attachment.mediaType, `${location}.mediaType`, 128);
      nullableString(errors, attachment.description, `${location}.description`, 1000);
    }
  }

  if (!Array.isArray(record.failures) || record.failures.some((entry) => typeof entry !== "string" || !entry)) {
    add(errors, "failures", "must be an array of non-empty strings");
  }
  if (Array.isArray(record.attachments) && record.attachments.length > 100) add(errors, "attachments", "must contain at most 100 entries");
  if (Array.isArray(record.failures) && record.failures.length > 100) add(errors, "failures", "must contain at most 100 entries");
}

function requireFilled(errors, value, location) {
  if (value === null || value === undefined || value === "") add(errors, location, "must be recorded for completed evidence");
}

function checkNotRun(errors, check, location) {
  if (check?.result === "not-run") add(errors, `${location}.result`, "cannot remain not-run in completed evidence");
  if (new Set(["fail", "blocked", "not-applicable"]).has(check?.result) && !check?.notes) {
    add(errors, `${location}.notes`, "must explain a non-pass result");
  }
}

function validateTemplate(record, errors) {
  if (record.recordState !== "template") add(errors, "recordState", "must equal template in --template mode");
  const nullableEvidencePaths = [
    "source.revision", "source.archive.name", "source.archive.sizeBytes", "source.archive.sha256",
    "finalArtifact.name", "finalArtifact.sizeBytes", "finalArtifact.sha256",
    "sourceBinding.artifactReportedRevision", "sourceBinding.rawEvidenceSha256",
    "target.observedOSVersion", "target.observedOSBuild", "target.hardware.manufacturer", "target.hardware.model",
    "target.hardware.cpuOrSoC", "target.hardware.memoryGiB", "target.hardware.physicalMachine",
    "download.browserName", "download.browserVersion", "download.url", "download.downloadedAt",
    "download.downloadedSha256", "download.quarantineOrMarkOfWebPresent",
    "externalPlay.observedVersion", "externalPlay.acquisitionURL", "externalPlay.installerSha256",
    "externalPlay.executableSha256", "externalPlay.codeDirectoryHash", "externalPlay.requiredFileSetEvidenceSha256",
    "externalPlay.identityKey", "externalPlay.publisherStatus", "externalPlay.publisherVerified",
    "externalPlay.rawEvidenceSha256", "externalPlay.notes", "functionalTests.fixture.name", "functionalTests.fixture.kind",
    "functionalTests.fixture.sha256", "functionalTests.fixture.sourceURL", "functionalTests.fixture.legalBasis",
    "tester.alias", "tester.role", "tester.startedAt", "tester.completedAt", "tester.timezone", "tester.notes",
    "attestation.observedOnNamedHardware", "attestation.finalArtifactHashMatched",
    "attestation.valuesRecordedWithoutFabrication",
  ];
  for (const field of nullableEvidencePaths) {
    if (valueAt(record, field) !== null) add(errors, field, "template must keep observed evidence null");
  }
  for (const field of CHECK_PATHS) {
    const check = valueAt(record, field);
    if (check?.result !== "not-run") add(errors, `${field}.result`, "template checks must remain not-run");
    if (check?.notes !== null) add(errors, `${field}.notes`, "template check notes must remain null");
  }
  const platformChecks = record.target?.operatingSystem === "macOS"
    ? ["appCodeSignature", "dmgCodeSignature", "stapledTicket", "gatekeeper"].map((field) => `platformSecurity.macOS.${field}`)
    : ["signtoolVerification", "timestampVerification", "defender", "smartScreen", "smartAppControl"].map((field) => `platformSecurity.windows.${field}`);
  for (const field of platformChecks) {
    const check = valueAt(record, field);
    if (check?.result !== "not-run") add(errors, `${field}.result`, "template checks must remain not-run");
    if (check?.notes !== null) add(errors, `${field}.notes`, "template check notes must remain null");
  }
  const macTemplatePaths = [
    "platformSecurity.macOS.developerIDApplication", "platformSecurity.macOS.teamIdentifier",
    "platformSecurity.macOS.hardenedRuntime", "platformSecurity.macOS.secureTimestamp",
    "platformSecurity.macOS.getTaskAllowAbsent", "platformSecurity.macOS.notarizationStatus",
    "platformSecurity.macOS.notarySubmissionID", "platformSecurity.macOS.notaryLogSha256",
    "platformSecurity.macOS.securityBypassUsed",
  ];
  const windowsTemplatePaths = [
    "platformSecurity.windows.authenticodePublisher", "platformSecurity.windows.signerCertificateSha256",
    "platformSecurity.windows.timestampAuthority", "platformSecurity.windows.securityBypassUsed",
  ];
  const observedPlatformPaths = record.target?.operatingSystem === "macOS" ? macTemplatePaths : windowsTemplatePaths;
  for (const field of observedPlatformPaths) {
    if (valueAt(record, field) !== null) add(errors, field, "template must keep observed evidence null");
  }
  if (record.target?.operatingSystem === "macOS" && record.platformSecurity?.windows !== null) {
    add(errors, "platformSecurity.windows", "must be null in a macOS template");
  }
  if (record.target?.operatingSystem === "Windows" && record.platformSecurity?.macOS !== null) {
    add(errors, "platformSecurity.macOS", "must be null in a Windows template");
  }
  if (record.attachments?.length !== 0) add(errors, "attachments", "template must not contain attachments");
  if (record.failures?.length !== 0) add(errors, "failures", "template must not claim failures");
}

function validateCompleted(record, errors, requirePass) {
  if (record.recordState !== "completed") add(errors, "recordState", "must equal completed");
  const requiredPaths = [
    "source.revision", "source.archive.name", "source.archive.sizeBytes", "source.archive.sha256",
    "finalArtifact.name", "finalArtifact.sizeBytes", "finalArtifact.sha256",
    "sourceBinding.artifactReportedRevision", "sourceBinding.rawEvidenceSha256",
    "target.observedOSVersion", "target.observedOSBuild", "target.hardware.manufacturer", "target.hardware.model",
    "target.hardware.cpuOrSoC", "target.hardware.memoryGiB", "target.hardware.physicalMachine",
    "download.browserName", "download.browserVersion", "download.url", "download.downloadedAt",
    "download.downloadedSha256", "download.quarantineOrMarkOfWebPresent",
    "externalPlay.observedVersion", "externalPlay.acquisitionURL", "externalPlay.installerSha256",
    "externalPlay.executableSha256", "externalPlay.identityKey", "externalPlay.publisherStatus",
    "externalPlay.publisherVerified", "externalPlay.rawEvidenceSha256",
    "functionalTests.fixture.name", "functionalTests.fixture.kind", "functionalTests.fixture.sha256",
    "functionalTests.fixture.legalBasis", "tester.alias", "tester.role", "tester.startedAt",
    "tester.completedAt", "tester.timezone", "attestation.observedOnNamedHardware",
    "attestation.finalArtifactHashMatched", "attestation.valuesRecordedWithoutFabrication",
  ];
  for (const field of requiredPaths) requireFilled(errors, valueAt(record, field), field);

  const target = TARGETS[record.target?.platformID];
  if (target && typeof record.finalArtifact?.name === "string" && !record.finalArtifact.name.endsWith(target.extension)) {
    add(errors, "finalArtifact.name", `must end with ${target.extension} for ${record.target.platformID}`);
  }
  if (typeof record.finalArtifact?.name === "string" && !record.finalArtifact.name.includes(record.product?.version)) {
    add(errors, "finalArtifact.name", "must include product.version");
  }
  if (typeof record.source?.archive?.name === "string" && !record.source.archive.name.includes(record.product?.version)) {
    add(errors, "source.archive.name", "must include product.version");
  }
  for (const [name, location] of [[record.source?.archive?.name, "source.archive.name"], [record.finalArtifact?.name, "finalArtifact.name"]]) {
    if (typeof name === "string" && (path.basename(name) !== name || name.includes("\\"))) {
      add(errors, location, "must be a plain filename without path components");
    }
  }
  if (record.sourceBinding?.artifactReportedRevision && record.source?.revision && record.sourceBinding.artifactReportedRevision !== record.source.revision) {
    add(errors, "sourceBinding.artifactReportedRevision", "must exactly match source.revision");
  }
  if (record.download?.downloadedSha256 && record.finalArtifact?.sha256 && record.download.downloadedSha256 !== record.finalArtifact.sha256) {
    add(errors, "download.downloadedSha256", "must exactly match finalArtifact.sha256");
  }
  if (record.download?.url && record.finalArtifact?.name) {
    try {
      const downloadedName = decodeURIComponent(path.posix.basename(new URL(record.download.url).pathname));
      if (downloadedName !== record.finalArtifact.name) add(errors, "download.url", "URL basename must match finalArtifact.name");
    } catch {
      // URL shape is reported by checkRecordShape.
    }
  }
  if (record.externalPlay?.observedVersion && record.externalPlay.observedVersion !== record.externalPlay.expectedVersion) {
    add(errors, "externalPlay.observedVersion", "must match the pinned expectedVersion");
  }
  if (record.functionalTests?.fixture?.kind === "homebrew-elf") {
    requireFilled(errors, record.functionalTests.fixture.sourceURL, "functionalTests.fixture.sourceURL");
  }
  if (record.target?.hardware?.physicalMachine !== true) add(errors, "target.hardware.physicalMachine", "must be true for release evidence");
  if (record.tester?.startedAt && record.tester?.completedAt && Date.parse(record.tester.completedAt) < Date.parse(record.tester.startedAt)) {
    add(errors, "tester.completedAt", "must not precede tester.startedAt");
  }

  for (const field of CHECK_PATHS) checkNotRun(errors, valueAt(record, field), field);

  if (!Array.isArray(record.attachments) || record.attachments.length === 0) {
    add(errors, "attachments", "completed evidence must include hashed raw evidence");
  }
  const attachmentHashes = new Set((record.attachments || []).map((attachment) => attachment?.sha256));
  for (const field of ["sourceBinding.rawEvidenceSha256", "externalPlay.rawEvidenceSha256"]) {
    const evidenceHash = valueAt(record, field);
    if (typeof evidenceHash === "string" && !attachmentHashes.has(evidenceHash)) {
      add(errors, field, "must match one attachments[].sha256 entry");
    }
  }

  if (record.target?.operatingSystem === "macOS") {
    if (record.platformSecurity?.windows !== null) add(errors, "platformSecurity.windows", "must be null for macOS evidence");
    const mac = record.platformSecurity?.macOS;
    if (!mac) {
      add(errors, "platformSecurity.macOS", "must be recorded for macOS evidence");
    } else {
      for (const field of ["developerIDApplication", "teamIdentifier", "notarizationStatus", "notarySubmissionID", "notaryLogSha256", "hardenedRuntime", "secureTimestamp", "getTaskAllowAbsent", "securityBypassUsed"]) {
        requireFilled(errors, mac[field], `platformSecurity.macOS.${field}`);
      }
      for (const field of ["appCodeSignature", "dmgCodeSignature", "stapledTicket", "gatekeeper"]) checkNotRun(errors, mac[field], `platformSecurity.macOS.${field}`);
      if (typeof mac.notaryLogSha256 === "string" && !attachmentHashes.has(mac.notaryLogSha256)) {
        add(errors, "platformSecurity.macOS.notaryLogSha256", "must match one attachments[].sha256 entry");
      }
    }
    requireFilled(errors, record.externalPlay?.codeDirectoryHash, "externalPlay.codeDirectoryHash");
    if (record.externalPlay?.identityMode !== "strict-developer-id") add(errors, "externalPlay.identityMode", "must be strict-developer-id on macOS");
    if (record.externalPlay?.publisherVerified !== true) add(errors, "externalPlay.publisherVerified", "must be true for the strict macOS identity lane");
  } else if (record.target?.operatingSystem === "Windows") {
    if (record.platformSecurity?.macOS !== null) add(errors, "platformSecurity.macOS", "must be null for Windows evidence");
    const windows = record.platformSecurity?.windows;
    if (!windows) {
      add(errors, "platformSecurity.windows", "must be recorded for Windows evidence");
    } else {
      for (const field of ["authenticodePublisher", "signerCertificateSha256", "timestampAuthority", "securityBypassUsed"]) {
        requireFilled(errors, windows[field], `platformSecurity.windows.${field}`);
      }
      for (const field of ["signtoolVerification", "timestampVerification", "defender", "smartScreen", "smartAppControl"]) checkNotRun(errors, windows[field], `platformSecurity.windows.${field}`);
    }
    requireFilled(errors, record.externalPlay?.requiredFileSetEvidenceSha256, "externalPlay.requiredFileSetEvidenceSha256");
    if (typeof record.externalPlay?.requiredFileSetEvidenceSha256 === "string" && !attachmentHashes.has(record.externalPlay.requiredFileSetEvidenceSha256)) {
      add(errors, "externalPlay.requiredFileSetEvidenceSha256", "must match one attachments[].sha256 entry");
    }
    if (record.externalPlay?.identityMode !== "hash-only") add(errors, "externalPlay.identityMode", "must be hash-only on Windows");
    if (record.externalPlay?.publisherVerified !== false) add(errors, "externalPlay.publisherVerified", "must be false for the approved unsigned Windows Play! build");
    if (record.externalPlay?.publisherStatus !== "NotSigned") add(errors, "externalPlay.publisherStatus", "must record NotSigned for the approved Windows Play! build");
  }

  if (!requirePass) return;
  for (const field of CHECK_PATHS) {
    if (valueAt(record, field)?.result !== "pass") add(errors, `${field}.result`, "must pass the final release gate");
  }
  if (record.target?.operatingSystem === "macOS") {
    const mac = record.platformSecurity?.macOS;
    for (const field of ["appCodeSignature", "dmgCodeSignature", "stapledTicket", "gatekeeper"]) {
      if (mac?.[field]?.result !== "pass") add(errors, `platformSecurity.macOS.${field}.result`, "must pass the final release gate");
    }
    if (mac?.notarizationStatus !== "Accepted") add(errors, "platformSecurity.macOS.notarizationStatus", "must equal Accepted");
    for (const field of ["hardenedRuntime", "secureTimestamp", "getTaskAllowAbsent"]) {
      if (mac?.[field] !== true) add(errors, `platformSecurity.macOS.${field}`, "must be true");
    }
    if (mac?.securityBypassUsed !== false) add(errors, "platformSecurity.macOS.securityBypassUsed", "must be false");
  } else if (record.target?.operatingSystem === "Windows") {
    const windows = record.platformSecurity?.windows;
    for (const field of ["signtoolVerification", "timestampVerification", "defender", "smartScreen", "smartAppControl"]) {
      if (windows?.[field]?.result !== "pass") add(errors, `platformSecurity.windows.${field}.result`, "must pass the final release gate");
    }
    if (windows?.securityBypassUsed !== false) add(errors, "platformSecurity.windows.securityBypassUsed", "must be false");
  }
  for (const field of ["observedOnNamedHardware", "finalArtifactHashMatched", "valuesRecordedWithoutFabrication"]) {
    if (record.attestation?.[field] !== true) add(errors, `attestation.${field}`, "must be true");
  }
  if (record.failures?.length !== 0) add(errors, "failures", "must be empty for a passing release record");
}

function scanSensitiveText(raw, errors) {
  const patterns = [
    [/(?:^|[\r\n])-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/m, "private-key material"],
    [/(?:^|[^A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})(?:[^A-Za-z0-9]|$)/, "GitHub token material"],
    [/\/(?:Users|home)\//, "personal local path"],
    [/[A-Za-z]:\\Users\\/i, "personal Windows path"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(raw)) add(errors, "$", `contains possible ${label}; keep credentials and personal paths out of evidence`);
  }
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

function safeBundlePath(root, relativePath, location, errors) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    add(errors, location, "must resolve to a file below RELEASE_EVIDENCE_BUNDLE_ROOT");
    return null;
  }
  return resolved;
}

function isPathBelow(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isPathAtOrBelow(root, candidate) {
  return path.resolve(root) === path.resolve(candidate) || isPathBelow(root, candidate);
}

async function verifyReferencedFile(root, relativePath, expectedSize, expectedSha256, location, errors) {
  const resolved = safeBundlePath(root, relativePath, location, errors);
  if (!resolved) return;
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    add(errors, location, `missing regular non-symlink file: ${relativePath}`);
    return;
  }
  if (expectedSize !== undefined && stat.size !== expectedSize) {
    add(errors, location, `size mismatch: record=${expectedSize} actual=${stat.size}`);
  }
  const actualSha256 = await sha256File(resolved);
  if (actualSha256 !== expectedSha256) {
    add(errors, location, `SHA-256 mismatch: record=${expectedSha256} actual=${actualSha256}`);
  }
}

async function verifyBundleFiles(record, bundleRoot, errors) {
  const rootStat = await fs.lstat(bundleRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    add(errors, "$", `RELEASE_EVIDENCE_BUNDLE_ROOT is not a regular directory: ${bundleRoot}`);
    return;
  }
  const sourceName = record.source?.archive?.name;
  const artifactName = record.finalArtifact?.name;
  for (const [name, location] of [[sourceName, "source.archive.name"], [artifactName, "finalArtifact.name"]]) {
    if (typeof name === "string" && (path.basename(name) !== name || name.includes("\\"))) {
      add(errors, location, "must be a plain filename without path components");
    }
  }
  if (typeof sourceName === "string" && typeof record.source.archive.sha256 === "string") {
    await verifyReferencedFile(
      bundleRoot,
      path.join("source", sourceName),
      record.source.archive.sizeBytes,
      record.source.archive.sha256,
      "source.archive",
      errors,
    );
  }
  if (typeof artifactName === "string" && typeof record.finalArtifact.sha256 === "string") {
    await verifyReferencedFile(
      bundleRoot,
      path.join("artifacts", artifactName),
      record.finalArtifact.sizeBytes,
      record.finalArtifact.sha256,
      "finalArtifact",
      errors,
    );
  }
  for (const [index, attachment] of (record.attachments || []).entries()) {
    if (typeof attachment?.relativePath !== "string" || typeof attachment?.sha256 !== "string") continue;
    await verifyReferencedFile(
      bundleRoot,
      attachment.relativePath,
      undefined,
      attachment.sha256,
      `attachments[${index}]`,
      errors,
    );
  }
}

async function validateFile(filePath, mode, requirePass, bundleRoot) {
  const errors = [];
  let raw;
  let record;
  if (requirePass) {
    const evidenceRoot = path.join(bundleRoot, "evidence");
    if (!isPathBelow(evidenceRoot, filePath)) {
      add(errors, "$", "passing evidence JSON must be a file below RELEASE_EVIDENCE_BUNDLE_ROOT/evidence");
    }
    const evidenceStat = await fs.lstat(filePath).catch(() => null);
    if (!evidenceStat?.isFile() || evidenceStat.isSymbolicLink()) {
      add(errors, "$", "passing evidence JSON must be a regular non-symlink file");
    }
  }
  try {
    raw = await fs.readFile(filePath, "utf8");
    record = JSON.parse(raw);
  } catch (error) {
    add(errors, "$", `cannot read valid JSON: ${error.message}`);
    return { errors, record: null };
  }
  scanSensitiveText(raw, errors);
  checkRecordShape(record, errors);
  if (mode === "template") validateTemplate(record, errors);
  else {
    validateCompleted(record, errors, requirePass);
    if (bundleRoot) await verifyBundleFiles(record, bundleRoot, errors);
  }
  return { errors, record };
}

function validateReleaseSet(entries) {
  const errors = [];
  const expectedPlatforms = Object.keys(TARGETS);
  if (entries.length !== expectedPlatforms.length) {
    add(errors, "$set", `--require-pass needs exactly ${expectedPlatforms.length} evidence files in one invocation`);
  }
  const platformCounts = new Map();
  for (const { record } of entries) {
    const platformID = record?.target?.platformID;
    platformCounts.set(platformID, (platformCounts.get(platformID) || 0) + 1);
  }
  for (const platformID of expectedPlatforms) {
    if (platformCounts.get(platformID) !== 1) add(errors, "$set", `must contain exactly one ${platformID} record`);
  }

  const reference = entries[0]?.record;
  if (reference) {
    for (const field of [
      "product.version", "source.revisionAlgorithm", "source.revision", "source.archive.name",
      "source.archive.sizeBytes", "source.archive.sha256",
    ]) {
      const expected = valueAt(reference, field);
      for (const { record } of entries.slice(1)) {
        if (valueAt(record, field) !== expected) {
          add(errors, `$set.${field}`, "must be identical across all four platform records");
          break;
        }
      }
    }
  }

  for (const field of ["finalArtifact.name", "finalArtifact.sha256", "download.url"]) {
    const values = entries.map(({ record }) => valueAt(record, field));
    if (new Set(values).size !== entries.length) add(errors, `$set.${field}`, "must be unique for every platform record");
  }
  return errors;
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const supportedModes = new Set(["--template", "--completed", "--require-pass"]);
  const selectedModes = argumentsList.filter((argument) => supportedModes.has(argument));
  const unsupportedFlags = argumentsList.filter((argument) => argument.startsWith("--") && !supportedModes.has(argument));
  if (selectedModes.length !== 1 || unsupportedFlags.length !== 0) {
    usage();
    process.exitCode = 64;
    return;
  }
  const templateMode = selectedModes[0] === "--template";
  const requirePass = selectedModes[0] === "--require-pass";
  const files = argumentsList.filter((argument) => !argument.startsWith("--"));
  if (files.length === 0) {
    usage();
    process.exitCode = 64;
    return;
  }
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema" || schema.type !== "object") {
    throw new Error("release-evidence.schema.json is not the expected JSON Schema draft and root type");
  }

  const mode = templateMode ? "template" : "completed";
  const bundleRootValue = process.env.RELEASE_EVIDENCE_BUNDLE_ROOT || null;
  const bundleRoot = bundleRootValue ? path.resolve(bundleRootValue) : null;
  if (requirePass && !bundleRoot) {
    console.error("--require-pass requires RELEASE_EVIDENCE_BUNDLE_ROOT so source, artifact, and attachment bytes are checked.");
    process.exitCode = 64;
    return;
  }
  if (requirePass && isPathAtOrBelow(repositoryRoot, bundleRoot)) {
    console.error("RELEASE_EVIDENCE_BUNDLE_ROOT must be outside the Git source repository.");
    process.exitCode = 64;
    return;
  }
  let failed = false;
  const releaseRecords = [];
  for (const file of files) {
    const resolved = path.resolve(file);
    const { errors, record } = await validateFile(resolved, mode, requirePass, bundleRoot);
    if (record) releaseRecords.push({ file: resolved, record });
    if (errors.length === 0) {
      console.log(`valid ${mode}${requirePass ? " passing" : ""} evidence: ${resolved}`);
      continue;
    }
    failed = true;
    console.error(`invalid ${mode} evidence: ${resolved}`);
    for (const error of errors) console.error(`  - ${error}`);
  }
  if (requirePass) {
    const setErrors = validateReleaseSet(releaseRecords);
    if (setErrors.length !== 0) {
      failed = true;
      console.error("invalid four-platform release evidence set");
      for (const error of setErrors) console.error(`  - ${error}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`evidence validation failed: ${error.message}`);
  process.exitCode = 1;
});
