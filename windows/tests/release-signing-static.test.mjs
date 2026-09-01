import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(testsDirectory, "..");

async function read(relativePath) {
  return readFile(path.join(windowsRoot, relativePath), "utf8");
}

test("signed public README preserves the external-core and architecture disclosures", async () => {
  const readme = await read("distribution/READ-ME-FIRST-PUBLIC-SIGNED.txt");
  assert.match(readme, /SIGNED PUBLIC RELEASE CANDIDATE/);
  assert.match(readme, /@VERSION@/);
  assert.match(readme, /@ARCHITECTURE@/);
  assert.match(readme, /@SOURCE_REVISION@/);
  assert.match(readme, /DO NOT DISTRIBUTE UNTIL ALL HUMAN RELEASE GATES PASS/);
  assert.match(readme, /does not include Play\.exe/);
  assert.match(readme, /hash-only byte identity, not verified publisher identity/i);
  assert.match(readme, /ARM64 package contains a native ARM64 PS2 Emu launcher/);
  assert.match(readme, /external\s+Play! process is x64/);
  assert.match(readme, /SOURCE-REVISION\.txt/);
  assert.match(readme, /Defender, SmartScreen, or Smart App Control/);
  assert.match(readme, /ps2dev\/ps2sdk/);
  assert.match(readme, /AFL 2\.0/);
  assert.match(readme, /1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584/);
  assert.match(readme, /commercial games/);
  assert.match(readme, /Final human review/);
});

test("release signer requires reviewed bytes, source identity, and CurrentUser code-signing identity", async () => {
  const script = await read("scripts/sign-windows-release.ps1");
  for (const parameter of [
    "UnsignedZipPath",
    "ReviewedUnsignedZipSha256",
    "SourceRevision",
    "CertificateThumbprint",
    "TimestampUrl",
  ]) {
    assert.match(script, new RegExp(`\\[Parameter\\(Mandatory = \\$true\\)\\][\\s\\S]{0,500}\\$${parameter}\\b`));
  }
  assert.match(script, /CurrentUser/);
  assert.match(script, /StoreName\]::My/);
  assert.match(script, /HasPrivateKey/);
  assert.match(script, /1\.3\.6\.1\.5\.5\.7\.3\.3/);
  assert.match(script, /Get-FileHash[^\n]+SHA256/);
  assert.match(script, /Reviewed unsigned ZIP SHA-256 does not match/);
  assert.match(script, /SOURCE-REVISION\.txt/);
  assert.match(script, /release-evidence\.json/);
  assert.match(script, /SourceRevision does not match the checked-out public repository HEAD/);
  assert.match(script, /public source worktree must be clean/);
  assert.match(script, /owner-approved public PS2 Emu repository/);
  assert.match(script, /current published origin\/main revision/);
  assert.match(script, /reviewed public source must not contain tracked symbolic links/);
  assert.match(script, /ls-files --error-unmatch/);
  assert.match(script, /Resources\/Fixtures\/ps2sdk-cube\.elf/);
  assert.match(script, /Unsigned ZIP filename version or product identity does not match the clean public checkout/);
  assert.match(script, /reviewedSourcePackageVersionMatched = \$true/);
  assert.match(script, /Test-ReviewedAppAsar/);
  assert.match(script, /reviewedAppAsarMatchesSource = \$true/);
});

test("release signer performs SHA256 Authenticode and RFC3161 verification without handling certificate secrets", async () => {
  const script = await read("scripts/sign-windows-release.ps1");
  assert.match(script, /'sign', '\/sha1'/);
  assert.match(script, /'\/fd', 'SHA256'/);
  assert.match(script, /'\/tr', \$TimestampUrl\.AbsoluteUri, '\/td', 'SHA256'/);
  assert.match(script, /'verify', '\/pa', '\/all', '\/v', '\/tw'/);
  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /TimeStamperCertificate/);
  assert.match(script, /SignatureStatus\]::NotSigned/);
  assert.match(script, /reviewed-unsigned-input\.zip/);
  assert.match(script, /bytes changed while the reviewed input was being isolated/);
  assert.match(script, /bytes changed during archive inspection or extraction/);
  assert.match(script, /ZIP PS2SDK Cube Demo SHA-256 does not match the pinned identity/);
  assert.match(script, /signtool\.exe is not validly signed by Microsoft Corporation/);
  assert.doesNotMatch(script, /Import-PfxCertificate|Export-PfxCertificate|ConvertTo-SecureString/);
  assert.doesNotMatch(script, /\[(?:Security\.)?SecureString\]/i);
  assert.doesNotMatch(script, /\$\w*(?:Password|Passphrase)\w*/i);
  assert.doesNotMatch(script, /Write-(?:Host|Output)[^\n]*(?:CertificateThumbprint|SignerCertificate|PrivateKey)/i);

  const environmentReferences = [...script.matchAll(/\$\{?env:([A-Za-z0-9_()]+)/g)].map((match) => match[1]);
  assert.deepEqual(environmentReferences.sort(), ["OS", "ProgramFiles(x86)"].sort());
});

test("release signer keeps unsigned and signed outputs in separate fail-closed lanes", async () => {
  const script = await read("scripts/sign-windows-release.ps1");
  assert.match(script, /UNSIGNED-DO-NOT-DISTRIBUTE\\\.zip/);
  assert.match(script, /launcher-Windows-\$publicArchToken\.zip/);
  assert.match(script, /dist\\signed-candidates/);
  assert.match(script, /signed-candidate-human-gates-incomplete/);
  assert.match(script, /publicDistributionApproved = \$false/);
  assert.match(script, /ownerPublicReleaseApprovalRecorded = \$false/);
  assert.match(script, /Refusing to overwrite an existing release output/);
  assert.match(script, /ZIP contains a symbolic link/);
  assert.match(script, /ZIP contains a duplicate case-insensitive path/);
  assert.match(script, /ZIP contains a Windows-unsafe path component/);
  assert.match(script, /ZIP contains a reserved Windows device path/);
  assert.match(script, /Package must contain exactly one executable/);
  assert.match(script, /bundled Play\.exe/);
  assert.match(script, /bundled Qt runtime/);
  assert.match(script, /bundled BIOS file/);
  assert.match(script, /bundled private key or signing credential/);
  assert.match(script, /\.rom0/);
  assert.match(script, /Test-ExactBundledDemoElfPath/);
  assert.match(script, /Test-BundledDemoResources/);
  assert.match(script, /bundledDemoResourcesMatchReviewedSource = \$true/);
  assert.match(script, /bundledDemoElfSha256Matched = \$true/);
  assert.match(script, /bundledDemoLicenseReviewRecorded = \$false/);
  for (const filename of [
    "ps2sdk-cube.elf",
    "PS2SDK-AFL-2.0.txt",
    "PS2SDK-CUBE-NOTICE.md",
    "NEWLIB-COPYING.txt",
    "GCC-COPYING.RUNTIME.txt",
    "GCC-COPYING3.txt",
  ]) assert.equal(script.includes(filename), true, filename);
});

test("native Windows npm test runs the PowerShell AST parser", async () => {
  const packageManifest = JSON.parse(await read("package.json"));
  assert.match(packageManifest.scripts.test, /check-powershell-release\.mjs/);
  assert.equal(packageManifest.scripts["check:release-powershell"], "node scripts/check-powershell-release.mjs");

  const checker = await read("scripts/check-powershell-release.mjs");
  assert.match(checker, /process\.platform !== "win32"/);
  assert.match(checker, /powershell\.exe/);
  assert.match(checker, /System\.Management\.Automation\.Language\.Parser/);
  assert.match(checker, /PS2_RELEASE_SCRIPT_PATH/);
});

test("release ASAR helper reuses the exact package verifier source allowlist", async () => {
  const helper = await read("scripts/verify-release-app-asar.mjs");
  const verifier = await read("scripts/verify-windows-packages.mjs");
  assert.match(helper, /verifyReviewedAppAsar/);
  assert.match(helper, /path\.isAbsolute/);
  assert.match(helper, /isSymbolicLink/);
  assert.match(verifier, /export async function verifyReviewedAppAsar/);
  assert.match(verifier, /app\.asar entry does not match the reviewed source bytes/);
  assert.match(verifier, /app\.asar contains entries outside the exact source allowlist/);
});
