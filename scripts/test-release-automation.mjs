#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const validator = path.join(projectRoot, "docs", "release-evidence", "validate-evidence.mjs");
const prepare = path.join(scriptDirectory, "prepare-release-bundle.mjs");
const upload = path.join(scriptDirectory, "upload-github-draft-release.sh");
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

console.log(`Passed ${checks} release-automation checks; no release was created or published.`);
