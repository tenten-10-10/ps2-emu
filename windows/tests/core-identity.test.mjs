import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import {
  OFFICIAL_CORE_IDENTITY_FILES,
  parseOfficialCoreIdentityManifest,
  verifyOfficialCoreIdentity,
} from "../app/lib/core-identity.mjs";
import {
  isUnexpectedInstallCodePath,
  queryWindowsIdentity,
} from "../scripts/lib/windows-core-evidence.mjs";

function digest(label) {
  return crypto.createHash("sha256").update(label).digest("hex");
}

async function shippedManifest() {
  return JSON.parse(await fs.readFile(
    new URL("../app/core-identity-manifest.json", import.meta.url),
    "utf8",
  ));
}

function evidenceForRelease(release) {
  return {
    schemaVersion: 1,
    installRoot: "C:\\Program Files\\Play",
    registryDisplayVersion: release.versionInfo.registryDisplayVersion,
    publisher: structuredClone(release.publisher),
    versionInfo: {
      productName: release.versionInfo.productName,
      productVersion: release.versionInfo.productVersion,
      fileVersion: release.versionInfo.fileVersion,
      originalFilename: release.versionInfo.originalFilename,
    },
    files: structuredClone(release.files),
  };
}

function syntheticSignedManifest() {
  const files = OFFICIAL_CORE_IDENTITY_FILES.map((filePath, index) => ({
    path: filePath,
    size: 1_000_000 + index,
    sha256: digest(`signed:${filePath}`),
    machine: "x64",
  }));
  return {
    schemaVersion: 2,
    approvalStatus: "ready",
    blockReason: null,
    approvedReleases: [{
      id: "test-only-signed-release",
      version: "99.99-test",
      upstreamCommit: "a".repeat(40),
      verificationPolicy: {
        mode: "authenticode",
        publisherVerified: true,
        userConsentRequired: false,
        warning: null,
      },
      sourceInstaller: {
        url: "https://purei.org/downloads/play/stable/99.99-test/Play-x86-64.exe",
        size: 12_345_678,
        sha256: digest("signed-installer"),
      },
      publisher: {
        status: "Valid",
        signerCertificateSha256: digest("publisher-certificate"),
        subject: "CN=Verified Play Publisher",
      },
      versionInfo: {
        productName: "Play!",
        productVersion: "99.99-test",
        fileVersion: "99.99.0.0",
        originalFilename: "Play.exe",
        registryDisplayVersion: "99.99-test",
      },
      files,
    }],
  };
}

test("shipped manifest approves only the reviewed unsigned hash-only release", async () => {
  const manifest = await shippedManifest();
  const parsed = parseOfficialCoreIdentityManifest(manifest);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.approvalStatus, "ready");
  assert.equal(parsed.approvedReleases.length, 1);
  const [release] = parsed.approvedReleases;
  assert.equal(release.id, "play-0.77-7-g04bde0df-windows-x64-hash-only");
  assert.equal(release.upstreamCommit, "04bde0df87ee7c0e2f0151b51bb2cc22c88541da");
  assert.equal(release.verificationPolicy.mode, "hash-only");
  assert.equal(release.verificationPolicy.publisherVerified, false);
  assert.equal(release.verificationPolicy.userConsentRequired, true);
  assert.match(release.verificationPolicy.warning, /unsigned/i);
  assert.match(release.verificationPolicy.warning, /publisher unverified/i);
  assert.deepEqual(release.publisher, {
    status: "NotSigned",
    signerCertificateSha256: null,
    subject: null,
  });
  assert.equal(release.sourceInstaller.size, 10_876_483);
  assert.equal(release.sourceInstaller.sha256, "8792b79b66118eacc99fb318545b766f1451396cb355adb0044a64fb8d6080b3");
  assert.deepEqual(release.files.map((file) => file.path), OFFICIAL_CORE_IDENTITY_FILES);
});

test("exact hash-only publisher, versions, Play.exe, and Qt identities are accepted", async () => {
  const manifest = await shippedManifest();
  const release = manifest.approvedReleases[0];
  const result = verifyOfficialCoreIdentity(evidenceForRelease(release), manifest);
  assert.equal(result.releaseID, release.id);
  assert.equal(result.version, "0.77-7-g04bde0df");
  assert.equal(result.playSha256, "eeb14b7a3a407cc45ba2d85052b015a54995abae36251b78172f00de45a769fa");
  assert.equal(result.verificationMode, "hash-only");
  assert.equal(result.publisherVerified, false);
  assert.equal(result.userConsentRequired, true);
  assert.equal(result.publisherSubject, null);
  assert.match(result.identityKey, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test("hash-only consent identity changes with every user-visible approval revision", async () => {
  const manifest = await shippedManifest();
  const release = manifest.approvedReleases[0];
  const baseline = verifyOfficialCoreIdentity(evidenceForRelease(release), manifest).identityKey;

  const changedWarning = structuredClone(manifest);
  changedWarning.approvedReleases[0].verificationPolicy.warning += " Approval notice revised.";
  const warningKey = verifyOfficialCoreIdentity(
    evidenceForRelease(changedWarning.approvedReleases[0]),
    changedWarning,
  ).identityKey;
  assert.notEqual(warningKey, baseline);

  const changedVersion = structuredClone(manifest);
  changedVersion.approvedReleases[0].versionInfo.productName += " reviewed";
  const versionKey = verifyOfficialCoreIdentity(
    evidenceForRelease(changedVersion.approvedReleases[0]),
    changedVersion,
  ).identityKey;
  assert.notEqual(versionKey, baseline);

  const changedInstaller = structuredClone(manifest);
  changedInstaller.approvedReleases[0].sourceInstaller.sha256 = digest("re-reviewed installer");
  const installerKey = verifyOfficialCoreIdentity(
    evidenceForRelease(changedInstaller.approvedReleases[0]),
    changedInstaller,
  ).identityKey;
  assert.notEqual(installerKey, baseline);
});

test("schema still supports a strictly signed Authenticode approval", () => {
  const manifest = syntheticSignedManifest();
  const parsed = parseOfficialCoreIdentityManifest(manifest);
  const result = verifyOfficialCoreIdentity(
    evidenceForRelease(manifest.approvedReleases[0]),
    manifest,
  );
  assert.equal(parsed.approvedReleases[0].verificationPolicy.mode, "authenticode");
  assert.equal(result.verificationMode, "authenticode");
  assert.equal(result.publisherVerified, true);
  assert.equal(result.userConsentRequired, false);
});

test("manifest rejects incomplete, typoed, floating, or falsely signed hash-only entries", async () => {
  const missingQt = await shippedManifest();
  missingQt.approvedReleases[0].files.pop();
  assert.throws(() => parseOfficialCoreIdentityManifest(missingQt), /exactly the required/);

  const duplicate = await shippedManifest();
  duplicate.approvedReleases[0].files[1].path = "Play.exe";
  assert.throws(() => parseOfficialCoreIdentityManifest(duplicate), /duplicate identity path/);

  const signedClaim = await shippedManifest();
  signedClaim.approvedReleases[0].publisher.status = "Valid";
  assert.throws(() => parseOfficialCoreIdentityManifest(signedClaim), /must explicitly record NotSigned/);

  const verifiedClaim = await shippedManifest();
  verifiedClaim.approvedReleases[0].verificationPolicy.publisherVerified = true;
  assert.throws(() => parseOfficialCoreIdentityManifest(verifiedClaim), /must be false for hash-only/);

  const missingConsent = await shippedManifest();
  missingConsent.approvedReleases[0].verificationPolicy.userConsentRequired = false;
  assert.throws(() => parseOfficialCoreIdentityManifest(missingConsent), /must be true for hash-only/);

  const vagueWarning = await shippedManifest();
  vagueWarning.approvedReleases[0].verificationPolicy.warning = "Hash matched.";
  assert.throws(() => parseOfficialCoreIdentityManifest(vagueWarning), /must explicitly say/);

  const floatingURL = await shippedManifest();
  floatingURL.approvedReleases[0].sourceInstaller.url = "https://purei.org/downloads.php";
  assert.throws(() => parseOfficialCoreIdentityManifest(floatingURL), /exact official CI object/);
});

test("hash-only identity verification fails closed for every publisher and version signal", async () => {
  const manifest = await shippedManifest();
  const release = manifest.approvedReleases[0];
  const mutations = [
    ["Authenticode status", (evidence) => { evidence.publisher.status = "Valid"; }],
    ["certificate", (evidence) => { evidence.publisher.signerCertificateSha256 = digest("other"); }],
    ["subject", (evidence) => { evidence.publisher.subject = "CN=Unexpected"; }],
    ["registry", (evidence) => { evidence.registryDisplayVersion = "0.77-other"; }],
    ["product name", (evidence) => { evidence.versionInfo.productName = "Play"; }],
    ["product version", (evidence) => { evidence.versionInfo.productVersion = "0.77-other"; }],
    ["file version", (evidence) => { evidence.versionInfo.fileVersion = "0.77-other"; }],
    ["filename", (evidence) => { evidence.versionInfo.originalFilename = "Other.exe"; }],
  ];
  for (const [label, mutate] of mutations) {
    const evidence = evidenceForRelease(release);
    mutate(evidence);
    assert.throws(() => verifyOfficialCoreIdentity(evidence, manifest), undefined, label);
  }
});

test("identity verification rejects changed size, hash, and PE machine for every runtime file", async () => {
  const manifest = await shippedManifest();
  const release = manifest.approvedReleases[0];
  for (let index = 0; index < OFFICIAL_CORE_IDENTITY_FILES.length; index += 1) {
    const changedHash = evidenceForRelease(release);
    changedHash.files[index].sha256 = digest(`changed:${index}`);
    assert.throws(
      () => verifyOfficialCoreIdentity(changedHash, manifest),
      index === 0 ? /not approved/ : /SHA-256 does not match/,
      `${OFFICIAL_CORE_IDENTITY_FILES[index]} hash`,
    );

    const changedSize = evidenceForRelease(release);
    changedSize.files[index].size += 1;
    assert.throws(
      () => verifyOfficialCoreIdentity(changedSize, manifest),
      /size does not match/,
      `${OFFICIAL_CORE_IDENTITY_FILES[index]} size`,
    );

    const changedMachine = evidenceForRelease(release);
    changedMachine.files[index].machine = "arm64";
    assert.throws(
      () => verifyOfficialCoreIdentity(changedMachine, manifest),
      /machine must be x64/,
      `${OFFICIAL_CORE_IDENTITY_FILES[index]} machine`,
    );
  }
});

test("PowerShell identity query uses a fixed executable and command with the path only in an environment value", async () => {
  const calls = [];
  const result = await queryWindowsIdentity("C:\\Program Files\\Play\\Play.exe", {
    platform: "win32",
    environment: { SystemRoot: "C:\\Windows", SAFE_TEST_VALUE: "kept" },
    execute: async (...args) => {
      calls.push(args);
      return {
        stdout: JSON.stringify({
          registryDisplayVersion: "0.77-7-g04bde0df",
          publisher: { status: "NotSigned", signerCertificateSha256: null, subject: null },
          versionInfo: {
            productName: "Play! - PlayStation2 Emulator",
            productVersion: "0.77-7-g04bde0df",
            fileVersion: "0.77-7-g04bde0df",
            originalFilename: "Play.exe",
          },
        }),
        stderr: "",
      };
    },
  });
  assert.equal(calls.length, 1);
  const [executable, args, options] = calls[0];
  assert.equal(executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(args.slice(0, 3), ["-NoLogo", "-NoProfile", "-NonInteractive"]);
  assert.equal(args.includes("C:\\Program Files\\Play\\Play.exe"), false);
  assert.equal(options.env.PS2_CORE_IDENTITY_PATH, "C:\\Program Files\\Play\\Play.exe");
  assert.equal(options.env.SAFE_TEST_VALUE, "kept");
  assert.equal(options.windowsHide, true);
  assert.equal(result.publisher.status, "NotSigned");
});

test("standard install code-surface guard rejects unlisted executable and plugin payloads", () => {
  for (const approved of [
    "Play.exe",
    "Qt5Core.dll",
    "platforms/qwindows.dll",
    "styles/qwindowsvistastyle.dll",
    "imageformats/qjpeg.dll",
    "uninstall.exe",
  ]) assert.equal(isUnexpectedInstallCodePath(approved), false, approved);
  for (const rejected of [
    "evil.dll",
    "plugins/extra.dll",
    "PlayHook.asi",
    "native.node",
    "helper.exe",
    "../escape.dll",
  ]) assert.equal(isUnexpectedInstallCodePath(rejected), true, rejected);
  assert.equal(isUnexpectedInstallCodePath("GameConfig.xml"), false);
});

test("PowerShell identity query rejects non-Windows hosts, relative paths, stderr, and malformed JSON", async () => {
  await assert.rejects(
    queryWindowsIdentity("C:\\Program Files\\Play\\Play.exe", { platform: "darwin" }),
    /must be collected on Windows/,
  );
  await assert.rejects(
    queryWindowsIdentity("relative\\Play.exe", {
      platform: "win32",
      environment: { SystemRoot: "C:\\Windows" },
    }),
    /absolute Windows path/,
  );
  await assert.rejects(
    queryWindowsIdentity("C:\\Program Files\\Play\\Play.exe", {
      platform: "win32",
      environment: { SystemRoot: "C:\\Windows" },
      execute: async () => ({ stdout: "{}", stderr: "warning" }),
    }),
    /unexpected stderr/,
  );
  await assert.rejects(
    queryWindowsIdentity("C:\\Program Files\\Play\\Play.exe", {
      platform: "win32",
      environment: { SystemRoot: "C:\\Windows" },
      execute: async () => ({ stdout: "not json", stderr: "" }),
    }),
    /not valid JSON/,
  );
});
