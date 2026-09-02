#!/usr/bin/env node

import path from "node:path";
import { verifyCmsSignedReleaseBinding } from "./lib/source-revision-binding.mjs";

function fail(message) {
  throw new Error(message);
}

const allowed = new Set(["--signed-evidence", "--expected-revision", "--expected-artifact-name", "--expected-artifact-size", "--expected-artifact-sha256", "--expected-signer-certificate-sha256"]);
const values = {};
const args = process.argv.slice(2);
if (args.length % 2 !== 0) fail("Every source binding verifier option requires one value.");
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index];
  if (!allowed.has(flag) || values[flag] !== undefined) fail(`Unsupported or duplicate option: ${flag}.`);
  values[flag] = args[index + 1];
}
if (!values["--signed-evidence"] || !/^[0-9a-f]{40}$/.test(values["--expected-revision"] || "")) fail("--signed-evidence and a lowercase 40-character --expected-revision are required.");
const expected = { sourceRevision: values["--expected-revision"] };
if (values["--expected-artifact-name"]) expected.finalArtifactName = values["--expected-artifact-name"];
if (values["--expected-artifact-size"]) {
  const size = Number(values["--expected-artifact-size"]);
  if (!Number.isSafeInteger(size) || size <= 0) fail("--expected-artifact-size must be a positive integer.");
  expected.finalArtifactSizeBytes = size;
}
if (values["--expected-artifact-sha256"]) expected.finalArtifactSha256 = values["--expected-artifact-sha256"];
if (values["--expected-signer-certificate-sha256"]) expected.signerCertificateSha256 = values["--expected-signer-certificate-sha256"];
const result = await verifyCmsSignedReleaseBinding(path.resolve(values["--signed-evidence"]), expected);
console.log(`bindingMethod=${result.manifest.bindingMethod}`);
console.log(`artifactReportedRevision=${result.manifest.sourceRevision}`);
console.log(`finalArtifactSha256=${result.manifest.finalArtifactSha256}`);
console.log(`signerCertificateSha256=${result.signerCertificateSha256}`);
