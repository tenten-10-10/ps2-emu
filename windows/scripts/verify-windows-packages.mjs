import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(scriptDirectory, "..");
const projectRoot = path.resolve(windowsRoot, "..");
const distributionDirectory = path.join(windowsRoot, "dist");
const packagePrefix = "PS2-Emu-0.1.0-Windows-";
const maximumArchiveBytes = 1024 * 1024 * 1024;

export const PACKAGE_SPECS = Object.freeze({
  x64: Object.freeze({
    arch: "x64",
    machine: 0x8664,
    artifactName: `${packagePrefix}x64-UNSIGNED-DO-NOT-DISTRIBUTE.zip`,
    packageDirectoryName: "PS2 Emu-win32-x64",
  }),
  arm64: Object.freeze({
    arch: "arm64",
    machine: 0xaa64,
    artifactName: `${packagePrefix}ARM64-UNSIGNED-DO-NOT-DISTRIBUTE.zip`,
    packageDirectoryName: "PS2 Emu-win32-arm64",
  }),
});

export const BUNDLED_DEMO_SHA256 = "1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584";
export const BUNDLED_DEMO_PACKAGE_DIRECTORY = "resources/PS2SDK-Cube-Demo";
export const BUNDLED_DEMO_ELF_PACKAGE_PATH = `${BUNDLED_DEMO_PACKAGE_DIRECTORY}/ps2sdk-cube.elf`;
const bundledDemoFiles = Object.freeze([
  Object.freeze({ sourceName: "ps2sdk-cube.elf", packageName: "ps2sdk-cube.elf" }),
  Object.freeze({ sourceName: "PS2SDK-AFL-2.0.txt", packageName: "PS2SDK-AFL-2.0.txt" }),
  Object.freeze({ sourceName: "PS2SDK-CUBE-NOTICE.md", packageName: "PS2SDK-CUBE-NOTICE.md" }),
  Object.freeze({ sourceName: "NEWLIB-COPYING.txt", packageName: "NEWLIB-COPYING.txt" }),
  Object.freeze({ sourceName: "GCC-COPYING.RUNTIME.txt", packageName: "GCC-COPYING.RUNTIME.txt" }),
  Object.freeze({ sourceName: "GCC-COPYING3.txt", packageName: "GCC-COPYING3.txt" }),
]);
const gameExtensions = new Set([".iso", ".mds", ".isz", ".cso", ".cue", ".chd", ".elf", ".rom", ".rom0", ".rom1", ".rom2"]);
const privateKeyExtensions = new Set([".key", ".keys", ".p8", ".p12", ".pfx", ".pvk", ".snk", ".pem"]);
const requiredAsarEntries = Object.freeze([
  "package.json",
  "main.mjs",
  "preload.cjs",
  "core-identity-manifest.json",
  "lib/bundled-demo.mjs",
  "lib/core.mjs",
  "lib/core-identity.mjs",
  "lib/windows-core-evidence.mjs",
  "lib/store.mjs",
  "renderer/index.html",
  "renderer/renderer.js",
  "renderer/styles.css",
  "renderer/assets/app-icon.png",
]);
const allowedAsarEntries = new Set([
  ...requiredAsarEntries,
  "lib",
  "renderer",
  "renderer/assets",
].map((entry) => entry.toLocaleLowerCase("en-US")));

function fail(message) {
  throw new Error(message);
}

export function parsePEMachine(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x40) return null;
  if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) return null;
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset < 0x40 || peOffset + 6 > buffer.length) return null;
  if (
    buffer[peOffset] !== 0x50
    || buffer[peOffset + 1] !== 0x45
    || buffer[peOffset + 2] !== 0
    || buffer[peOffset + 3] !== 0
  ) return null;
  return buffer.readUInt16LE(peOffset + 4);
}

export function prohibitedPayloadReason(entryName) {
  const normalized = String(entryName).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const basename = path.posix.basename(normalized).toLocaleLowerCase("en-US");
  const extension = path.posix.extname(basename);

  if (basename === "play.exe") return "bundled Play.exe";
  if (/^qt.*\.dll$/i.test(basename)) return "bundled Qt runtime";
  if (basename === "states.db") return "bundled Play! compatibility database";
  if (gameExtensions.has(extension)) {
    if (extension === ".elf" && isExactBundledDemoElfPath(normalized)) return null;
    return "bundled game or homebrew image";
  }
  if (privateKeyExtensions.has(extension)) return "bundled private key or signing credential";
  if (basename === ".env" || basename.startsWith(".env.")) return "bundled environment secret file";
  if (["id_rsa", "id_ed25519", "credentials", "credentials.json"].includes(basename)) {
    return "bundled credential file";
  }
  if (/(?:^|[-_.])bios(?:[-_.]|$)/i.test(basename) || /^scph\d+\.(?:bin|rom\d?)$/i.test(basename)) {
    return "bundled BIOS file";
  }
  if (extension === ".pdb") return "debug symbol file";
  return null;
}

export function isExactBundledDemoElfPath(entryName) {
  const normalized = String(entryName).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (normalized === BUNDLED_DEMO_ELF_PACKAGE_PATH) return true;
  const components = normalized.split("/");
  return components.length === 4
    && components.slice(1).join("/") === BUNDLED_DEMO_ELF_PACKAGE_PATH;
}

export function validateArchiveEntryNames(entries) {
  if (!Array.isArray(entries) || entries.length === 0) fail("ZIP is empty.");
  const roots = new Set();
  const seen = new Set();

  for (const rawEntry of entries) {
    if (typeof rawEntry !== "string" || rawEntry.length === 0) fail("ZIP contains an empty entry name.");
    if (/[\u0000-\u001f\u007f]/.test(rawEntry)) fail("ZIP contains a control character in an entry name.");
    if (rawEntry.includes("\\")) fail(`ZIP entry uses a backslash: ${rawEntry}`);
    const entry = rawEntry.replace(/\/+$/g, "");
    if (entry.length === 0 || entry.startsWith("/") || /^[A-Za-z]:/.test(entry)) {
      fail(`ZIP contains an absolute path: ${rawEntry}`);
    }
    const components = entry.split("/");
    if (components.some((component) => component.length === 0 || component === "." || component === "..")) {
      fail(`ZIP contains an unsafe path component: ${rawEntry}`);
    }
    roots.add(components[0]);

    const key = entry.toLocaleLowerCase("en-US");
    if (seen.has(key)) fail(`ZIP contains a duplicate case-insensitive path: ${rawEntry}`);
    seen.add(key);

    if (components.includes("__MACOSX") || components.some((component) => component === ".DS_Store" || component.startsWith("._"))) {
      fail(`ZIP contains macOS metadata: ${rawEntry}`);
    }
    const prohibited = prohibitedPayloadReason(entry);
    if (prohibited) fail(`ZIP contains ${prohibited}: ${rawEntry}`);
  }

  if (roots.size !== 1) fail(`ZIP must contain exactly one top-level directory; found ${roots.size}.`);
  return Object.freeze({ root: [...roots][0], normalizedEntries: Object.freeze([...seen]) });
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

async function assertRegularFile(filePath, label, minimumBytes = 1) {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} is missing or is not a regular file: ${filePath}`);
  if (stat.size < minimumBytes) fail(`${label} is unexpectedly small: ${stat.size} bytes.`);
  return stat;
}

export async function verifyBundledDemoResources(packageRoot) {
  const packagedDirectory = path.join(packageRoot, ...BUNDLED_DEMO_PACKAGE_DIRECTORY.split("/"));
  const sourceDirectory = path.join(projectRoot, "Resources", "Fixtures");
  const expectedNames = bundledDemoFiles.map((spec) => spec.packageName).sort();
  const entries = await fs.readdir(packagedDirectory, { withFileTypes: true }).catch((error) => {
    fail(`Packaged PS2SDK Cube Demo directory cannot be read: ${error.message}`);
  });
  const actualNames = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
    || actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail(`Packaged PS2SDK Cube Demo inventory is not exact: ${actualNames.join(", ")}`);
  }
  for (const spec of bundledDemoFiles) {
    const packagedPath = path.join(packagedDirectory, spec.packageName);
    const sourcePath = path.join(sourceDirectory, spec.sourceName);
    await assertRegularFile(packagedPath, `packaged PS2SDK Cube Demo resource ${spec.packageName}`);
    await assertRegularFile(sourcePath, `reviewed PS2SDK Cube Demo source ${spec.sourceName}`);
    const packagedBytes = await fs.readFile(packagedPath);
    const sourceBytes = await fs.readFile(sourcePath);
    if (spec.packageName === "ps2sdk-cube.elf") {
      const digest = crypto.createHash("sha256").update(packagedBytes).digest("hex");
      if (digest !== BUNDLED_DEMO_SHA256) {
        fail(`Packaged PS2SDK Cube Demo SHA-256 mismatch: expected ${BUNDLED_DEMO_SHA256}, found ${digest}.`);
      }
    }
    if (!packagedBytes.equals(sourceBytes)) {
      fail(`Packaged PS2SDK Cube Demo resource does not match reviewed source bytes: ${spec.packageName}`);
    }
  }
}

async function assertExtractedTreeIsRegular(rootDirectory) {
  const queue = [rootDirectory];
  while (queue.length > 0) {
    const current = queue.pop();
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) fail(`Extracted package contains a symbolic link: ${current}`);
    if (stat.isDirectory()) {
      const children = await fs.readdir(current);
      for (const child of children) queue.push(path.join(current, child));
    } else if (!stat.isFile()) {
      fail(`Extracted package contains a non-file filesystem object: ${current}`);
    }
  }
}

async function listZipEntries(archivePath) {
  if (process.platform !== "darwin") fail("The Windows ZIP verifier currently requires macOS /usr/bin/unzip and ditto.");
  await execFileAsync("/usr/bin/unzip", ["-t", archivePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const { stdout } = await execFileAsync("/usr/bin/unzip", ["-Z1", archivePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split("\n").filter((entry) => entry.length > 0);
}

async function readPEMachineFile(executablePath, fileSize) {
  const handle = await fs.open(executablePath, "r");
  try {
    const dosHeader = Buffer.alloc(0x40);
    const { bytesRead } = await handle.read(dosHeader, 0, dosHeader.length, 0);
    if (bytesRead !== dosHeader.length || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) return null;
    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < 0x40 || peOffset > 16 * 1024 * 1024 || peOffset + 6 > fileSize) return null;
    const signatureAndMachine = Buffer.alloc(6);
    const result = await handle.read(signatureAndMachine, 0, signatureAndMachine.length, peOffset);
    if (result.bytesRead !== signatureAndMachine.length) return null;
    if (
      signatureAndMachine[0] !== 0x50
      || signatureAndMachine[1] !== 0x45
      || signatureAndMachine[2] !== 0
      || signatureAndMachine[3] !== 0
    ) return null;
    return signatureAndMachine.readUInt16LE(4);
  } finally {
    await handle.close();
  }
}

async function loadAsarModule() {
  const require = createRequire(import.meta.url);
  let asarEntry;
  try {
    asarEntry = require.resolve("@electron/asar");
  } catch {
    fail("The pinned direct @electron/asar verifier dependency is not installed.");
  }
  return import(pathToFileURL(asarEntry).href);
}

export async function verifyReviewedAppAsar(asarPath) {
  const asar = await loadAsarModule();
  if (typeof asar.listPackage !== "function" || typeof asar.extractFile !== "function") {
    fail("Resolved @electron/asar does not expose listPackage and extractFile.");
  }
  const listed = await Promise.resolve(asar.listPackage(asarPath));
  if (!Array.isArray(listed) || listed.length === 0) fail("app.asar has no entries.");

  const normalized = new Set();
  for (const rawEntry of listed) {
    if (typeof rawEntry !== "string" || /[\u0000-\u001f\u007f]/.test(rawEntry)) {
      fail("app.asar contains an invalid entry name.");
    }
    const entry = rawEntry.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!entry) continue;
    const components = entry.split("/");
    if (components.some((component) => component.length === 0 || component === "." || component === "..")) {
      fail(`app.asar contains an unsafe path: ${rawEntry}`);
    }
    const key = entry.toLocaleLowerCase("en-US");
    if (normalized.has(key)) fail(`app.asar contains a duplicate case-insensitive path: ${rawEntry}`);
    normalized.add(key);
    const prohibited = prohibitedPayloadReason(entry);
    if (prohibited) fail(`app.asar contains ${prohibited}: ${rawEntry}`);
  }

  for (const required of requiredAsarEntries) {
    if (!normalized.has(required.toLocaleLowerCase("en-US"))) fail(`app.asar is missing required entry: ${required}`);
  }
  const unexpectedEntries = [...normalized].filter((entry) => !allowedAsarEntries.has(entry));
  if (unexpectedEntries.length > 0 || normalized.size !== allowedAsarEntries.size) {
    fail(`app.asar contains entries outside the exact source allowlist: ${unexpectedEntries.join(", ") || "entry-count mismatch"}`);
  }

  for (const required of requiredAsarEntries) {
    if (required === "package.json") continue;
    let packagedBytes;
    try {
      packagedBytes = Buffer.from(await Promise.resolve(asar.extractFile(asarPath, required)));
    } catch (error) {
      fail(`app.asar source entry could not be extracted: ${required}: ${error.message}`);
    }
    const sourceBytes = await fs.readFile(path.join(windowsRoot, "app", ...required.split("/")));
    if (!packagedBytes.equals(sourceBytes)) {
      fail(`app.asar entry does not match the reviewed source bytes: ${required}`);
    }
  }

  let appPackage;
  try {
    const packageBytes = await Promise.resolve(asar.extractFile(asarPath, "package.json"));
    appPackage = JSON.parse(Buffer.from(packageBytes).toString("utf8"));
  } catch (error) {
    fail(`app.asar package.json could not be read: ${error.message}`);
  }
  if (
    appPackage?.name !== "ps2-emulator-windows"
    || appPackage?.productName !== "PS2 Emu"
    || appPackage?.version !== "0.1.0"
    || appPackage?.main !== "main.mjs"
    || (appPackage?.private !== undefined && appPackage.private !== true)
  ) fail(`app.asar package.json identity does not match PS2 Emu 0.1.0: name=${JSON.stringify(appPackage?.name)} productName=${JSON.stringify(appPackage?.productName)} version=${JSON.stringify(appPackage?.version)} main=${JSON.stringify(appPackage?.main)} private=${JSON.stringify(appPackage?.private)}.`);
  if (appPackage.dependencies && Object.keys(appPackage.dependencies).length > 0) {
    fail("app.asar package.json unexpectedly declares runtime dependencies.");
  }
}

function specForArtifactName(artifactName) {
  return Object.values(PACKAGE_SPECS).find((candidate) => candidate.artifactName === artifactName) || null;
}

export async function verifyWindowsPackage(archivePath, expectedSpec = null) {
  const resolvedArchive = path.resolve(archivePath);
  const artifactName = path.basename(resolvedArchive);
  const spec = expectedSpec || specForArtifactName(artifactName);
  if (!spec || artifactName !== spec.artifactName) fail(`Unexpected Windows artifact name: ${artifactName}`);

  const archiveStat = await assertRegularFile(resolvedArchive, "Windows ZIP", 1024 * 1024);
  if (archiveStat.size > maximumArchiveBytes) fail(`Windows ZIP exceeds ${maximumArchiveBytes} bytes.`);

  const entries = await listZipEntries(resolvedArchive);
  const archiveIndex = validateArchiveEntryNames(entries);
  if (archiveIndex.root !== spec.packageDirectoryName) {
    fail(`ZIP root does not match ${spec.arch}: expected ${spec.packageDirectoryName}, found ${archiveIndex.root}.`);
  }

  const requiredZipEntries = [
    `${archiveIndex.root}/PS2 Emu.exe`,
    `${archiveIndex.root}/resources/app.asar`,
    `${archiveIndex.root}/LICENSE`,
    `${archiveIndex.root}/LICENSES.chromium.html`,
    `${archiveIndex.root}/PS2-EMU-LICENSE.txt`,
    `${archiveIndex.root}/READ-ME-FIRST.txt`,
    `${archiveIndex.root}/PRIVACY.md`,
    `${archiveIndex.root}/SECURITY.md`,
    ...bundledDemoFiles.map((spec) => (
      `${archiveIndex.root}/${BUNDLED_DEMO_PACKAGE_DIRECTORY}/${spec.packageName}`
    )),
  ];
  for (const required of requiredZipEntries) {
    if (!archiveIndex.normalizedEntries.includes(required.toLocaleLowerCase("en-US"))) {
      fail(`ZIP is missing required entry: ${required}`);
    }
  }
  const executableEntries = archiveIndex.normalizedEntries.filter((entry) => entry.endsWith(".exe"));
  if (executableEntries.length !== 1 || executableEntries[0] !== `${archiveIndex.root}/PS2 Emu.exe`.toLocaleLowerCase("en-US")) {
    fail(`ZIP must contain only the launcher executable; found: ${executableEntries.join(", ") || "none"}.`);
  }
  const unpackedPrefix = `${archiveIndex.root}/resources/app.asar.unpacked`.toLocaleLowerCase("en-US");
  const looseAppPrefix = `${archiveIndex.root}/resources/app`.toLocaleLowerCase("en-US");
  const defaultAsar = `${archiveIndex.root}/resources/default_app.asar`.toLocaleLowerCase("en-US");
  if (archiveIndex.normalizedEntries.some((entry) => entry === unpackedPrefix || entry.startsWith(`${unpackedPrefix}/`))) {
    fail("ZIP unexpectedly contains app.asar.unpacked content.");
  }
  if (archiveIndex.normalizedEntries.some((entry) => entry === looseAppPrefix || entry.startsWith(`${looseAppPrefix}/`))) {
    fail("ZIP unexpectedly contains a loose resources/app directory.");
  }
  if (archiveIndex.normalizedEntries.includes(defaultAsar)) {
    fail("ZIP contains Electron's default_app.asar instead of only the packaged application.");
  }

  const extractionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-windows-verify-"));
  try {
    await execFileAsync("/usr/bin/ditto", ["-x", "-k", "--noqtn", resolvedArchive, extractionRoot], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const packageRoot = path.join(extractionRoot, archiveIndex.root);
    await assertExtractedTreeIsRegular(packageRoot);

    const executablePath = path.join(packageRoot, "PS2 Emu.exe");
    const executableStat = await assertRegularFile(executablePath, "launcher executable", 1024 * 1024);
    const machine = await readPEMachineFile(executablePath, executableStat.size);
    if (machine !== spec.machine) {
      const rendered = machine === null ? "invalid PE" : `0x${machine.toString(16).padStart(4, "0")}`;
      fail(`Launcher PE Machine mismatch for ${spec.arch}: expected 0x${spec.machine.toString(16)}, found ${rendered}.`);
    }

    await assertRegularFile(path.join(packageRoot, "LICENSE"), "Electron LICENSE", 100);
    await assertRegularFile(path.join(packageRoot, "LICENSES.chromium.html"), "Chromium license inventory", 1000);
    const wrapperLicensePath = path.join(packageRoot, "PS2-EMU-LICENSE.txt");
    await assertRegularFile(wrapperLicensePath, "PS2 Emu MIT license", 500);
    const wrapperLicense = await fs.readFile(wrapperLicensePath, "utf8");
    if (!wrapperLicense.includes("MIT License") || !wrapperLicense.includes("Copyright (c) 2026 ten:ten")) {
      fail("Packaged PS2 Emu license does not match the owner-approved MIT identity.");
    }
    await assertRegularFile(path.join(packageRoot, "PRIVACY.md"), "privacy notice", 100);
    await assertRegularFile(path.join(packageRoot, "SECURITY.md"), "security policy", 100);
    const asarPath = path.join(packageRoot, "resources", "app.asar");
    await assertRegularFile(asarPath, "app.asar", 1000);
    await verifyReviewedAppAsar(asarPath);
    await verifyBundledDemoResources(packageRoot);

    const readmePath = path.join(packageRoot, "READ-ME-FIRST.txt");
    await assertRegularFile(readmePath, "distribution warning", 300);
    const readme = await fs.readFile(readmePath, "utf8");
    const requiredWarnings = [
      "UNSIGNED",
      "DO NOT DISTRIBUTE",
      "not been executed or tested on Windows",
      "does not include Play.exe",
      "Windows 11 on Arm",
      "HASH-ONLY",
      "publisher is unverified",
      "ps2dev/ps2sdk",
      "AFL 2.0",
      BUNDLED_DEMO_SHA256,
      "commercial games",
    ];
    for (const warning of requiredWarnings) {
      if (!readme.includes(warning)) fail(`Distribution warning is missing required text: ${warning}`);
    }
  } finally {
    await fs.rm(extractionRoot, { recursive: true, force: true });
  }

  return Object.freeze({
    arch: spec.arch,
    artifactName,
    size: archiveStat.size,
    sha256: await sha256File(resolvedArchive),
    machine: `0x${spec.machine.toString(16).padStart(4, "0")}`,
  });
}

export async function verifyDefaultDistributionSet() {
  const expectedNames = new Set(Object.values(PACKAGE_SPECS).map((spec) => spec.artifactName));
  const directoryEntries = await fs.readdir(distributionDirectory, { withFileTypes: true }).catch((error) => {
    fail(`Windows distribution directory cannot be read: ${error.message}`);
  });
  const candidateEntries = directoryEntries
    .filter((entry) => entry.name.startsWith("PS2-") && entry.name.endsWith(".zip"));
  const nonFiles = candidateEntries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (nonFiles.length > 0) fail(`Windows ZIP candidates must be regular files: ${nonFiles.join(", ")}`);
  const candidates = candidateEntries.map((entry) => entry.name);
  const unexpected = candidates.filter((name) => !expectedNames.has(name));
  if (unexpected.length > 0) fail(`Unexpected Windows ZIP candidates are present: ${unexpected.join(", ")}`);
  for (const expected of expectedNames) {
    if (!candidates.includes(expected)) fail(`Expected Windows ZIP is missing: ${expected}`);
  }
  return Promise.all(Object.values(PACKAGE_SPECS).map((spec) => (
    verifyWindowsPackage(path.join(distributionDirectory, spec.artifactName), spec)
  )));
}

async function main() {
  const argumentsToVerify = process.argv.slice(2);
  const results = argumentsToVerify.length === 0
    ? await verifyDefaultDistributionSet()
    : await Promise.all(argumentsToVerify.map((argument) => {
      const artifactPath = path.resolve(argument);
      const spec = specForArtifactName(path.basename(artifactPath));
      if (!spec) fail(`Artifact name is not one of the two approved unsigned candidates: ${path.basename(artifactPath)}`);
      return verifyWindowsPackage(artifactPath, spec);
    }));
  for (const result of results) {
    console.log(`verified ${result.artifactName}`);
    console.log(`  arch=${result.arch} machine=${result.machine}`);
    console.log(`  bytes=${result.size} sha256=${result.sha256}`);
  }
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  main().catch((error) => {
    console.error(`Windows package verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
