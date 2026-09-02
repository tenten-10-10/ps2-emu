#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const validator = path.join(projectRoot, "docs", "release-evidence", "validate-evidence.mjs");
const prepare = path.join(scriptDirectory, "prepare-release-bundle.mjs");
const upload = path.join(scriptDirectory, "upload-github-draft-release.sh");
const preflight = path.join(scriptDirectory, "public-release-preflight.sh");
const buildApp = path.join(scriptDirectory, "build-app.sh");
const packageDmg = path.join(scriptDirectory, "package-dmg.sh");
const signReleaseApp = path.join(scriptDirectory, "sign-release-app.sh");
const verifyApp = path.join(scriptDirectory, "verify-app.sh");
const verifyReleaseDmg = path.join(scriptDirectory, "verify-release-dmg.sh");
const templates = [
  "0.1.0-macos-arm64.template.json",
  "0.1.0-macos-x86_64.template.json",
  "0.1.0-windows-x64.template.json",
  "0.1.0-windows-arm64.template.json",
];

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

for (const template of templates) {
  const result = spawnSync(process.execPath, [
    validator,
    "--template",
    path.join(projectRoot, "docs", "release-evidence", "templates", template),
  ], { cwd: projectRoot, encoding: "utf8" });
  check(result.status === 0, `${template} failed template validation: ${result.stderr}`);
}

const nodeSyntax = spawnSync(process.execPath, ["--check", prepare], { cwd: projectRoot, encoding: "utf8" });
check(nodeSyntax.status === 0, `prepare-release-bundle.mjs has invalid syntax: ${nodeSyntax.stderr}`);

const prepareSource = fs.readFileSync(prepare, "utf8");
check(prepareSource.includes("publicationPerformedByPreparation: false"), "release preparation must record that it performs no publication");
check(!prepareSource.includes("draftOnly: true"), "release record must not become permanently draft-only after final approval");

const shellSyntax = spawnSync("/bin/zsh", ["-n", upload], { cwd: projectRoot, encoding: "utf8" });
check(shellSyntax.status === 0, `upload-github-draft-release.sh has invalid syntax: ${shellSyntax.stderr}`);

const preflightSyntax = spawnSync("/bin/zsh", ["-n", preflight], { cwd: projectRoot, encoding: "utf8" });
check(preflightSyntax.status === 0, `public-release-preflight.sh has invalid syntax: ${preflightSyntax.stderr}`);

const preflightSource = fs.readFileSync(preflight, "utf8");
for (const required of [
  "RELEASE_EVIDENCE_BUNDLE_ROOT",
  "validate-evidence.mjs",
  "--require-pass",
  "EXPECTED_WINDOWS_SIGNER_CERT_SHA256",
  "PS2_OPENSSL_PATH",
  "/usr/bin/openssl",
  "source.revision",
  "target.platformID",
]) check(preflightSource.includes(required), `public preflight is missing its ${required} external-evidence gate`);
for (const forbidden of [
  "REAL_HARDWARE_TEST.md",
  "CLEAN_MAC_GATEKEEPER_TEST.md",
  'docs/release-evidence/$version/$target_arch',
]) check(!preflightSource.includes(forbidden), `public preflight still requires completed evidence inside Git: ${forbidden}`);

for (const macScript of [buildApp, packageDmg, signReleaseApp, verifyApp, verifyReleaseDmg]) {
  const syntax = spawnSync("/bin/zsh", ["-n", macScript], { cwd: projectRoot, encoding: "utf8" });
  check(syntax.status === 0, `${path.basename(macScript)} has invalid syntax: ${syntax.stderr}`);
}

const buildAppSource = fs.readFileSync(buildApp, "utf8");
check(buildAppSource.includes('/usr/bin/xattr -cr "$output_app"'), "copied macOS app must remove file-provider metadata");
check(buildAppSource.indexOf('/usr/bin/xattr -cr "$output_app"') < buildAppSource.lastIndexOf("codesign --verify"), "copied app must be verified after metadata removal");

const signReleaseAppSource = fs.readFileSync(signReleaseApp, "utf8");
const revisionCheckOffset = signReleaseAppSource.indexOf("Unsigned app is not bound to the reviewed source commit");
const xattrClearOffset = signReleaseAppSource.indexOf('/usr/bin/xattr -cr "$app_path"');
const releaseSignOffset = signReleaseAppSource.indexOf("--options runtime");
check(revisionCheckOffset >= 0 && revisionCheckOffset < xattrClearOffset, "release app path must be source-bound before metadata removal");
check(xattrClearOffset >= 0 && xattrClearOffset < releaseSignOffset, "release app metadata must be removed before Developer ID signing");

const packageDmgSource = fs.readFileSync(packageDmg, "utf8");
check(packageDmgSource.includes('/usr/bin/xattr -cr "$staging/PS2 Emu.app"'), "DMG staging app must remove copied metadata");

const verifyAppSource = fs.readFileSync(verifyApp, "utf8");
check(verifyAppSource.includes("/^Timestamp=/"), "release app verification must parse the codesign timestamp");
check(verifyAppSource.includes("does not contain a secure timestamp"), "release app verification must reject a missing secure timestamp");

const verifyReleaseDmgSource = fs.readFileSync(verifyReleaseDmg, "utf8");
check(verifyReleaseDmgSource.includes("/^Timestamp=/"), "release DMG verification must parse the codesign timestamp");
check(verifyReleaseDmgSource.includes("does not contain a secure timestamp"), "release DMG verification must reject a missing secure timestamp");

const uploadSource = fs.readFileSync(upload, "utf8");
for (const required of [
  "PS2_DRAFT_UPLOAD_APPROVED",
  "prepare-release-bundle.mjs",
  "gh release create",
  "gh release upload",
  "gh release download",
  "gh release edit",
  "--draft",
  "Refusing to alter a published release",
]) check(uploadSource.includes(required), `draft uploader is missing its ${required} gate`);
for (const forbidden of [
  "gh release delete",
  "--clobber",
  "--latest",
  "--draft=false",
  "--draft false",
]) check(!uploadSource.includes(forbidden), `draft uploader contains forbidden publication/destructive token: ${forbidden}`);

const uploadWithoutApproval = spawnSync("/bin/zsh", [upload], {
  cwd: projectRoot,
  encoding: "utf8",
  env: { PATH: process.env.PATH ?? "" },
});
check(uploadWithoutApproval.status !== 0, "draft uploader must fail without explicit approval");
check(uploadWithoutApproval.stderr.includes("PS2_DRAFT_UPLOAD_APPROVED=1"), "draft uploader did not identify the approval gate");

const prepareWithoutInputs = spawnSync(process.execPath, [prepare], {
  cwd: projectRoot,
  encoding: "utf8",
  env: { PATH: process.env.PATH ?? "" },
});
check(prepareWithoutInputs.status !== 0, "release bundle preparer must fail without bound inputs");
check(prepareWithoutInputs.stderr.includes("SOURCE_REVISION"), "release bundle preparer did not identify the source binding gate");

const preflightBaseEnvironment = {
  PATH: process.env.PATH ?? "",
  EXPECTED_OUTER_TEAM_ID: "TESTTEAM1",
  PS2_BUNDLE_PLAY: "0",
  PS2_TARGET_ARCH: "arm64",
  RELEASE_EVIDENCE_NODE: process.execPath,
  EXPECTED_WINDOWS_SIGNER_CERT_SHA256: "ab".repeat(32),
  PS2_OPENSSL_PATH: "/usr/bin/openssl",
};
const preflightWithoutEvidence = spawnSync("/bin/zsh", [preflight, path.join(os.tmpdir(), "ps2-preflight-missing-output")], {
  cwd: projectRoot,
  encoding: "utf8",
  env: preflightBaseEnvironment,
});
check(preflightWithoutEvidence.status !== 0, "public preflight must fail without external evidence");
check(
  preflightWithoutEvidence.stdout.includes("RELEASE_EVIDENCE_BUNDLE_ROOT is required"),
  "public preflight did not identify the missing external evidence root",
);

const preflightWithRepositoryEvidence = spawnSync("/bin/zsh", [preflight, path.join(os.tmpdir(), "ps2-preflight-missing-output")], {
  cwd: projectRoot,
  encoding: "utf8",
  env: { ...preflightBaseEnvironment, RELEASE_EVIDENCE_BUNDLE_ROOT: projectRoot },
});
check(preflightWithRepositoryEvidence.status !== 0, "public preflight must reject evidence inside Git");
check(
  preflightWithRepositoryEvidence.stdout.includes("must remain outside the Git source repository"),
  "public preflight did not identify the in-repository evidence boundary",
);

const invalidEvidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ps2-preflight-evidence-"));
try {
  const evidenceDirectory = path.join(invalidEvidenceRoot, "evidence");
  fs.mkdirSync(evidenceDirectory);
  const signerPinCases = [
    ["AB".repeat(32), false, "uppercase signer pin"],
    [`${"ab".repeat(31)}zz`, false, "non-hex signer pin"],
    ["ab".repeat(31), false, "short signer pin"],
    ["ab".repeat(32), true, "valid signer pin"],
  ];
  for (const [pin, accepted, label] of signerPinCases) {
    const result = spawnSync("/bin/zsh", [preflight, path.join(os.tmpdir(), "ps2-preflight-missing-output")], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...preflightBaseEnvironment, RELEASE_EVIDENCE_BUNDLE_ROOT: invalidEvidenceRoot, EXPECTED_WINDOWS_SIGNER_CERT_SHA256: pin },
    });
    check(result.status !== 0, `${label} must not pass an otherwise incomplete preflight`);
    if (accepted) {
      check(result.stdout.includes("must contain platform JSON records"), `${label} was not accepted before the later evidence-file gate`);
    } else {
      check(result.stdout.includes("exactly 64 lowercase hexadecimal characters"), `${label} was not rejected by the signer-pin gate`);
    }
  }
  fs.writeFileSync(path.join(evidenceDirectory, "macos-arm64.json"), "{}\n", { mode: 0o600 });
  const preflightWithInvalidEvidence = spawnSync("/bin/zsh", [preflight, path.join(os.tmpdir(), "ps2-preflight-missing-output")], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...preflightBaseEnvironment, RELEASE_EVIDENCE_BUNDLE_ROOT: invalidEvidenceRoot },
  });
  check(preflightWithInvalidEvidence.status !== 0, "public preflight must fail when validate-evidence rejects the bundle");
  check(
    preflightWithInvalidEvidence.stdout.includes("failed validate-evidence --require-pass"),
    "public preflight did not report fail-closed validator rejection",
  );
} finally {
  fs.rmSync(invalidEvidenceRoot, { recursive: true, force: true });
}

console.log(`Passed ${checks} release-automation checks; no release was created or published.`);
