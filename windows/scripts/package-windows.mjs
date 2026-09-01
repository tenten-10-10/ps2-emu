import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import pngToIco from "png-to-ico";
import {
  PACKAGE_SPECS,
  prohibitedPayloadReason,
  verifyDefaultDistributionSet,
  verifyWindowsPackage,
} from "./verify-windows-packages.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(scriptDirectory, "..");
const projectRoot = path.resolve(windowsRoot, "..");
const appDirectory = path.join(windowsRoot, "app");
const distributionDirectory = path.join(windowsRoot, "dist");
const warningSource = path.join(windowsRoot, "distribution", "READ-ME-FIRST.txt");
const wrapperLicenseSource = path.join(windowsRoot, "distribution", "PS2-EMU-LICENSE.txt");
const privacySource = path.join(projectRoot, "PRIVACY.md");
const securitySource = path.join(projectRoot, "SECURITY.md");
const buildDirectory = path.join(windowsRoot, ".build");
const previousPackagesDirectory = path.join(buildDirectory, "previous-windows-packages");

function fail(message) {
  throw new Error(message);
}

async function assertAppSourceIsSafe() {
  const requiredFiles = [
    "package.json",
    "main.mjs",
    "preload.cjs",
    "core-identity-manifest.json",
    path.join("lib", "core.mjs"),
    path.join("lib", "core-identity.mjs"),
    path.join("lib", "windows-core-evidence.mjs"),
    path.join("lib", "store.mjs"),
    path.join("renderer", "index.html"),
    path.join("renderer", "renderer.js"),
    path.join("renderer", "styles.css"),
    path.join("renderer", "assets", "app-icon.png"),
  ];
  for (const relativePath of requiredFiles) {
    const candidate = path.join(appDirectory, relativePath);
    const stat = await fs.lstat(candidate).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size === 0) {
      fail(`Required app source is missing, empty, or not a regular file: ${relativePath}`);
    }
  }

  const queue = [appDirectory];
  while (queue.length > 0) {
    const directory = queue.pop();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) fail(`App source contains a symbolic link: ${candidate}`);
      if (stat.isDirectory()) {
        if (entry.name === "node_modules") fail("windows/app must not contain its own node_modules directory.");
        queue.push(candidate);
      } else if (!stat.isFile()) {
        fail(`App source contains a non-file filesystem object: ${candidate}`);
      } else {
        const relative = path.relative(appDirectory, candidate).split(path.sep).join("/");
        const prohibited = prohibitedPayloadReason(relative);
        if (prohibited) fail(`App source contains ${prohibited}: ${relative}`);
      }
    }
  }
}

async function readAppIdentity() {
  const appPackage = JSON.parse(await fs.readFile(path.join(appDirectory, "package.json"), "utf8"));
  if (
    appPackage?.name !== "ps2-emulator-windows"
    || appPackage?.productName !== "PS2 Emu"
    || appPackage?.version !== "0.1.0"
    || appPackage?.main !== "main.mjs"
    || appPackage?.private !== true
  ) fail("windows/app/package.json identity does not match PS2 Emu 0.1.0.");
  if (appPackage.dependencies && Object.keys(appPackage.dependencies).length > 0) {
    fail("windows/app/package.json must not declare runtime dependencies for this candidate.");
  }
  return appPackage;
}

async function makeWindowsIcon(workRoot) {
  const iconSource = path.join(appDirectory, "renderer", "assets", "app-icon.png");
  const iconTarget = path.join(workRoot, "PS2-Emu.ico");
  const iconBytes = await pngToIco(iconSource);
  if (!Buffer.isBuffer(iconBytes) || iconBytes.length < 1024) fail("Windows ICO generation produced an invalid result.");
  await fs.writeFile(iconTarget, iconBytes, { mode: 0o600, flag: "wx" });
  return iconTarget;
}

async function createPackage(spec, workRoot, iconPath) {
  const packagerOutput = path.join(workRoot, "electron-packager");
  await fs.mkdir(packagerOutput, { recursive: true, mode: 0o700 });
  const packagePaths = await packager({
    dir: appDirectory,
    out: packagerOutput,
    platform: "win32",
    arch: spec.arch,
    electronVersion: "44.1.0",
    name: "PS2 Emu",
    executableName: "PS2 Emu",
    appVersion: "0.1.0",
    buildVersion: "0.1.0",
    appCopyright: "Copyright (c) 2026 ten:ten",
    asar: true,
    prune: true,
    overwrite: false,
    junk: true,
    icon: iconPath,
    win32metadata: {
      FileDescription: "PS2 Emu launcher",
      InternalName: "PS2 Emu",
      OriginalFilename: "PS2 Emu.exe",
      ProductName: "PS2 Emu",
    },
    ignore: [
      /^\/?\.DS_Store$/,
      /^\/?\._/,
      /^\/?artifacts(?:\/|$)/,
    ],
  });
  if (!Array.isArray(packagePaths) || packagePaths.length !== 1) {
    fail(`Electron Packager returned ${packagePaths?.length ?? "an invalid number of"} outputs for ${spec.arch}.`);
  }
  const packagePath = path.resolve(packagePaths[0]);
  if (path.basename(packagePath) !== spec.packageDirectoryName) {
    fail(`Electron Packager output name mismatch for ${spec.arch}: ${path.basename(packagePath)}`);
  }
  const relativeToWorkRoot = path.relative(workRoot, packagePath);
  if (relativeToWorkRoot.startsWith("..") || path.isAbsolute(relativeToWorkRoot)) {
    fail("Electron Packager returned an output outside the isolated work directory.");
  }
  await fs.copyFile(warningSource, path.join(packagePath, "READ-ME-FIRST.txt"), fs.constants.COPYFILE_EXCL);
  await fs.copyFile(wrapperLicenseSource, path.join(packagePath, "PS2-EMU-LICENSE.txt"), fs.constants.COPYFILE_EXCL);
  await fs.copyFile(privacySource, path.join(packagePath, "PRIVACY.md"), fs.constants.COPYFILE_EXCL);
  await fs.copyFile(securitySource, path.join(packagePath, "SECURITY.md"), fs.constants.COPYFILE_EXCL);
  return packagePath;
}

async function createZip(packagePath, spec, artifactStagingDirectory) {
  const zipPath = path.join(artifactStagingDirectory, spec.artifactName);
  await execFileAsync(
    "/usr/bin/ditto",
    ["-c", "-k", "--norsrc", "--noextattr", "--keepParent", packagePath, zipPath],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    },
  );
  return zipPath;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function publishVerifiedArtifacts(stagedArtifacts) {
  await fs.mkdir(distributionDirectory, { recursive: true, mode: 0o755 });
  const currentEntries = await fs.readdir(distributionDirectory, { withFileTypes: true });
  const candidateEntries = currentEntries.filter((entry) => (
    entry.name.startsWith("PS2-")
    && entry.name.endsWith(".zip")
  ));
  const invalidCandidates = candidateEntries.filter((entry) => !entry.isFile());
  if (invalidCandidates.length > 0) {
    fail(`Refusing non-file Windows ZIP candidates: ${invalidCandidates.map((entry) => entry.name).join(", ")}`);
  }
  const candidatesToPreserve = candidateEntries;

  let backupDirectory = null;
  if (candidatesToPreserve.length > 0) {
    backupDirectory = path.join(
      previousPackagesDirectory,
      `${timestampForPath()}-${crypto.randomUUID()}`,
    );
    await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    for (const entry of candidatesToPreserve) {
      await fs.rename(
        path.join(distributionDirectory, entry.name),
        path.join(backupDirectory, entry.name),
      );
    }
  }

  for (const staged of stagedArtifacts) {
    const destination = path.join(distributionDirectory, path.basename(staged));
    const existing = await fs.lstat(destination).catch(() => null);
    if (existing) fail(`Refusing to overwrite an existing artifact after preservation: ${destination}`);
    await fs.rename(staged, destination);
  }
  return backupDirectory;
}

async function removeIsolatedWorkDirectory(workRoot) {
  const resolvedBuild = `${path.resolve(buildDirectory)}${path.sep}`;
  const resolvedWork = path.resolve(workRoot);
  if (!resolvedWork.startsWith(resolvedBuild) || !path.basename(resolvedWork).startsWith("package-work-")) {
    fail(`Refusing to remove an unexpected work directory: ${resolvedWork}`);
  }
  await fs.rm(resolvedWork, { recursive: true, force: true });
}

async function main() {
  if (process.platform !== "darwin") {
    fail("This cross-packaging script is intentionally limited to macOS and uses /usr/bin/ditto.");
  }
  const ditto = await fs.lstat("/usr/bin/ditto").catch(() => null);
  if (!ditto?.isFile()) fail("Required macOS packaging tool is unavailable: /usr/bin/ditto");
  await assertAppSourceIsSafe();
  await readAppIdentity();
  const warning = await fs.readFile(warningSource, "utf8").catch((error) => {
    fail(`Distribution warning cannot be read: ${error.message}`);
  });
  if (!warning.includes("UNSIGNED") || !warning.includes("DO NOT DISTRIBUTE")) {
    fail("Distribution warning does not identify these artifacts as unsigned and non-distributable.");
  }
  for (const [label, source] of [["privacy notice", privacySource], ["security policy", securitySource]]) {
    const stat = await fs.lstat(source).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 100) {
      fail(`Required ${label} is missing or invalid: ${source}`);
    }
  }
  const wrapperLicense = await fs.readFile(wrapperLicenseSource, "utf8").catch((error) => {
    fail(`Wrapper MIT license cannot be read: ${error.message}`);
  });
  if (!wrapperLicense.includes("MIT License") || !wrapperLicense.includes("Copyright (c) 2026 ten:ten")) {
    fail("Wrapper license does not match the owner-approved MIT identity.");
  }

  await fs.mkdir(buildDirectory, { recursive: true, mode: 0o700 });
  const workRoot = await fs.mkdtemp(path.join(buildDirectory, "package-work-"));
  try {
    const iconPath = await makeWindowsIcon(workRoot);
    const artifactStagingDirectory = path.join(workRoot, "verified-artifacts");
    await fs.mkdir(artifactStagingDirectory, { mode: 0o700 });
    const stagedArtifacts = [];
    const verificationResults = [];
    for (const spec of [PACKAGE_SPECS.x64, PACKAGE_SPECS.arm64]) {
      console.log(`Packaging Windows ${spec.arch} with Electron Packager...`);
      const packagePath = await createPackage(spec, workRoot, iconPath);
      const archivePath = await createZip(packagePath, spec, artifactStagingDirectory);
      const verified = await verifyWindowsPackage(archivePath, spec);
      stagedArtifacts.push(archivePath);
      verificationResults.push(verified);
    }

    const backupDirectory = await publishVerifiedArtifacts(stagedArtifacts);
    await verifyDefaultDistributionSet();
    if (backupDirectory) console.log(`Previous Windows ZIPs preserved at: ${backupDirectory}`);
    for (const result of verificationResults) {
      console.log(`Created: ${path.join(distributionDirectory, result.artifactName)}`);
      console.log(`  arch=${result.arch} machine=${result.machine}`);
      console.log(`  bytes=${result.size} sha256=${result.sha256}`);
    }
    console.log("These artifacts are unsigned, cross-packaged candidates and have not run on Windows.");
  } finally {
    await removeIsolatedWorkDirectory(workRoot);
  }
}

main().catch((error) => {
  console.error(`Windows packaging failed: ${error.message}`);
  process.exitCode = 1;
});
