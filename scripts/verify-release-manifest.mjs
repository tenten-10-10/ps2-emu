import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import siteConfig from "../site/site.config.mjs";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "release/release-manifest.json"), "utf8"));
const plist = await readFile(resolve(root, "Resources/Info.plist"), "utf8");
const windowsPackage = JSON.parse(await readFile(resolve(root, "windows/package.json"), "utf8"));
const windowsAppPackage = JSON.parse(await readFile(resolve(root, "windows/app/package.json"), "utf8"));
const windowsCoreIdentityManifest = JSON.parse(
  await readFile(resolve(root, "windows/app/core-identity-manifest.json"), "utf8"),
);

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function plistValue(key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  return match?.[1] ?? null;
}

function loadBrowserConfig(relativePath, globalName) {
  return readFile(resolve(root, relativePath), "utf8").then((source) => {
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox, { filename: relativePath });
    return sandbox.window[globalName];
  });
}

check(manifest.schemaVersion === 1, "release manifest schema changed unexpectedly");
check(manifest.product.name === "PS2 Emu", "product name mismatch");
check(manifest.product.license === "MIT", "wrapper license identifier mismatch");
check(manifest.product.copyrightHolder === "ten:ten", "copyright holder mismatch");
check(manifest.product.copyrightYear === 2026, "copyright year mismatch");
check(manifest.product.version === plistValue("CFBundleShortVersionString"), "macOS version drift");
check(manifest.product.build === plistValue("CFBundleVersion"), "macOS build drift");
check(manifest.product.bundleIdentifier === plistValue("CFBundleIdentifier"), "bundle identifier drift");
check(manifest.product.version === windowsPackage.version, "Windows build-package version drift");
check(manifest.product.version === windowsAppPackage.version, "Windows app-package version drift");
check(manifest.product.version === siteConfig.currentVersion, "teaser version drift");
check(manifest.distributionMode === "external-core", "public manifest must remain external-core");
execFileSync("/bin/sh", [resolve(root, "scripts/verify-bundled-homebrew.sh")], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});
const bundledHomebrew = manifest.bundledHomebrew;
check(bundledHomebrew?.id === "ps2sdk-cube-demo", "bundled homebrew identity drift");
check(bundledHomebrew?.displayName === "PS2SDK Cube Demo", "bundled homebrew display name drift");
check(bundledHomebrew?.kind === "open-source-homebrew-demo", "bundled fixture must remain a demo");
check(bundledHomebrew?.commercialGame === false, "bundled fixture must not be described as a commercial game");
check(bundledHomebrew?.filePath === "Resources/Fixtures/ps2sdk-cube.elf", "bundled fixture path drift");
check(bundledHomebrew?.byteSize === 174772, "bundled fixture byte-size drift");
check(bundledHomebrew?.sha256 === "1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584", "bundled fixture hash drift");
check(bundledHomebrew?.license === "AFL-2.0", "bundled fixture license drift");
check(bundledHomebrew?.sourceRevision === "39a89923ce59152fa855250cfacaccf8e581a1eb", "bundled fixture source revision drift");
check(bundledHomebrew?.upstreamActionsRun === 33232694254, "bundled fixture CI provenance drift");
check(bundledHomebrew?.upstreamArtifactSha256 === "b2d3c6e46a9d6348da2442b9ad76a4486d1522d2c802bc885f3afdbffa1a61f2", "bundled fixture artifact digest drift");
check(bundledHomebrew?.toolchainContainerSha256 === "e15fcc76f5ae2f450a8359f7541ae806535992099f5df39dd180698b3ef52508", "bundled fixture toolchain digest drift");
check(Array.isArray(bundledHomebrew?.noticePaths) && bundledHomebrew.noticePaths.length === 5, "bundled fixture notice set drift");
check(Array.isArray(bundledHomebrew?.sourcePaths) && bundledHomebrew.sourcePaths.length === 3, "bundled fixture preserved-source set drift");
check(manifest.publicReleaseApproved === false, "public approval cannot be enabled in source metadata");
check(manifest.sourceRevision === null, "unreleased manifest must not claim a source revision");
let wrapperLicenseExists = true;
try {
  await access(resolve(root, "LICENSE"));
} catch {
  wrapperLicenseExists = false;
}
check(
  manifest.gates.wrapperLicenseSelected === wrapperLicenseExists,
  "wrapper license gate must match the top-level LICENSE state",
);
const wrapperLicense = wrapperLicenseExists
  ? await readFile(resolve(root, "LICENSE"), "utf8")
  : "";
check(wrapperLicense.startsWith("MIT License\n"), "top-level LICENSE must contain the MIT text");
check(wrapperLicense.includes("Copyright (c) 2026 ten:ten"), "top-level LICENSE copyright line mismatch");

const expectedPlatforms = {
  "macos-arm64": { os: "macOS", launcher: "arm64", core: "arm64", compatibility: "native", extension: ".dmg" },
  "macos-x86_64": { os: "macOS", launcher: "x86_64", core: "x86_64", compatibility: "native", extension: ".dmg" },
  "windows-x64": { os: "Windows", launcher: "x64", core: "x64", compatibility: "native", extension: ".zip" },
  "windows-arm64": { os: "Windows", launcher: "arm64", core: "x64", compatibility: "windows-x64-emulation", extension: ".zip" },
};
check(Array.isArray(manifest.platforms), "platform list is missing");
check(manifest.platforms.length === 4, "release manifest must contain exactly four targets");
check(new Set(manifest.platforms.map(({ id }) => id)).size === 4, "release target IDs must be unique");

for (const platform of manifest.platforms) {
  const expected = expectedPlatforms[platform.id];
  check(Boolean(expected), `unexpected release target: ${platform.id}`);
  check(platform.operatingSystem === expected.os, `${platform.id} operating system drift`);
  check(platform.launcherArchitecture === expected.launcher, `${platform.id} launcher architecture drift`);
  check(platform.coreArchitecture === expected.core, `${platform.id} core architecture drift`);
  check(platform.compatibilityMode === expected.compatibility, `${platform.id} compatibility disclosure drift`);
  check(platform.coreDelivery === "external-official-installation", `${platform.id} must not bundle a core`);
  check(typeof platform.minimumOS === "string" && platform.minimumOS.length > 0, `${platform.id} minimum OS is missing`);
  check(platform.candidateArtifactName.includes(manifest.product.version), `${platform.id} candidate version drift`);
  check(platform.candidateArtifactName.includes("UNSIGNED-DO-NOT-DISTRIBUTE"), `${platform.id} candidate lacks the unsigned warning`);
  check(platform.candidateArtifactName.endsWith(expected.extension), `${platform.id} candidate extension drift`);
  check(platform.publicArtifactName === null, `${platform.id} must not claim a public artifact`);
  check(platform.sha256 === null, `${platform.id} must not claim a public checksum`);
  check(platform.publisher === null, `${platform.id} must not claim a publisher`);
  check(platform.state === "blocked", `${platform.id} must remain blocked before signed release review`);
}

const requiredFalseGates = [
  "downloadsEnabled",
  "paymentsEnabled",
  "macOSDeveloperIdAndNotarizationComplete",
  "windowsAuthenticodeComplete",
  "bundledHomebrewHumanLicenseReviewComplete",
  "bundledHomebrewFunctionalEvidenceComplete",
  "cleanMachineEvidenceComplete",
  "realHardwareEvidenceComplete",
];
for (const gate of requiredFalseGates) {
  check(manifest.gates[gate] === false, `${gate} must remain false in the unreleased manifest`);
}
check(manifest.gates.windowsStandardCorePolicyApproved === true, "owner-approved Windows hash-only policy is missing");
check(manifest.gates.windowsStandardCoreRuntimeIntegrationComplete === true, "Windows hash-only runtime integration gate is missing");
check(manifest.gates.bundledHomebrewTechnicalVerificationComplete === true, "bundled homebrew technical verification gate is missing");
check(windowsCoreIdentityManifest.schemaVersion === 2, "Windows core identity schema drift");
check(windowsCoreIdentityManifest.approvalStatus === "ready", "Windows core identity manifest is not ready");
check(windowsCoreIdentityManifest.blockReason === null, "ready Windows core identity manifest must not claim a blocker");
check(windowsCoreIdentityManifest.approvedReleases?.length === 1, "Windows core identity manifest must approve exactly one release");
const approvedWindowsCore = windowsCoreIdentityManifest.approvedReleases[0];
check(approvedWindowsCore.id === "play-0.77-7-g04bde0df-windows-x64-hash-only", "Windows approved core identity drift");
check(approvedWindowsCore.verificationPolicy?.mode === "hash-only", "Windows approved core must remain hash-only");
check(approvedWindowsCore.verificationPolicy?.publisherVerified === false, "Windows hash-only core must not claim a verified publisher");
check(approvedWindowsCore.verificationPolicy?.userConsentRequired === true, "Windows hash-only core must require explicit consent");
check(approvedWindowsCore.publisher?.status === "NotSigned", "Windows hash-only core must remain explicitly unsigned");
check(approvedWindowsCore.files?.length === 7, "Windows approved core must pin Play.exe and six Qt code files");

const downloadConfig = await loadBrowserConfig("site/public/download-config.js", "PS2_DOWNLOAD_CONFIG");
const supportConfig = await loadBrowserConfig("site/public/support-config.js", "PS2_SUPPORT_CONFIG");
check(downloadConfig.downloadsEnabled === manifest.gates.downloadsEnabled, "site download gate drift");
check(supportConfig.paymentsEnabled === manifest.gates.paymentsEnabled, "site payment gate drift");

console.log(`Passed ${checks} release-manifest checks for four blocked platform candidates.`);
