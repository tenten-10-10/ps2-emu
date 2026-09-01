import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_SPECS,
  parsePEMachine,
  prohibitedPayloadReason,
  validateArchiveEntryNames,
} from "../scripts/verify-windows-packages.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(testDirectory, "..");
const appRoot = path.join(windowsRoot, "app");

async function read(relativePath) {
  return fs.readFile(path.join(windowsRoot, relativePath), "utf8");
}

async function sourceFiles(directory) {
  const files = [];
  const queue = [directory];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(candidate);
      else if (entry.isFile() && /\.(?:cjs|mjs|js|html|css|json)$/i.test(entry.name)) files.push(candidate);
    }
  }
  return files;
}

function fakePE(machine) {
  const buffer = Buffer.alloc(512);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write("PE\0\0", 0x80, "binary");
  buffer.writeUInt16LE(machine, 0x84);
  return buffer;
}

test("Electron renderer is sandboxed with a deny-by-default CSP", async () => {
  const main = await read("app/main.mjs");
  const html = await read("app/renderer/index.html");

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.doesNotMatch(main, /nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webSecurity:\s*false/);
  assert.match(main, /setWindowOpenHandler\([\s\S]*?action:\s*["']deny["']/);
  assert.match(main, /will-navigate[\s\S]*?preventDefault\(\)/);

  const csp = html.match(/Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1] || "";
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]) assert.equal(csp.includes(directive), true, directive);
  assert.equal(csp.includes("'unsafe-inline'"), false);
  assert.equal(csp.includes("'unsafe-eval'"), false);
});

test("core launch never invokes a shell and renderer content avoids HTML injection sinks", async () => {
  const main = await read("app/main.mjs");
  const renderer = await read("app/renderer/renderer.js");
  assert.match(main, /spawn\(core\.path,\s*args,\s*\{[\s\S]*?shell:\s*false/);
  assert.doesNotMatch(main, /shell:\s*true|\bexecSync?\s*\(|cmd\.exe|powershell(?:\.exe)?/i);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/);
  assert.match(renderer, /\.textContent\s*=/);
});

test("compatibility and custom-core warnings are enforced by the main process", async () => {
  const main = await read("app/main.mjs");
  const preload = await read("app/preload.cjs");
  const renderer = await read("app/renderer/renderer.js");
  assert.match(main, /canRunX64PlayCore\(/);
  assert.match(main, /armCompatibilityConsentKey/);
  assert.match(main, /standardCoreConsentKey/);
  assert.match(main, /modifiedCoreConsentKey\(validated\)/);
  assert.match(main, /changed or no longer matches the approved path and SHA-256/);
  assert.match(main, /showMessageBox\(mainWindow,[\s\S]*?x64 Play! compatibility core/);
  assert.match(main, /ipcMain\.handle\(["']core:choose-modified["'][\s\S]*?Approve this exact custom Play\.exe/);
  assert.match(main, /confirmHashOnlyStandardCore\(core\)/);
  assert.match(main, /This Play! build is unsigned\. Its publisher cannot be verified\./);
  assert.match(main, /const revalidatedCore = await resolveValidatedCore\(\)/);
  assert.match(main, /assertCoreExecutableIdentity\(core\)/);
  assert.match(main, /identity changed before launch/);
  assert.doesNotMatch(preload, /acknowledged\s*:\s*true/);
  assert.doesNotMatch(renderer, /window\.confirm\(/);
  assert.match(renderer, /closest\(["']\[data-game-id\]["']\)/);
  assert.match(main, /mainWindow\.on\(["']close["'][\s\S]*?stopOwnedCore\(\)/);
});

test("preload exposes a narrow invoke-only bridge", async () => {
  const preload = await read("app/preload.cjs");
  assert.match(preload, /contextBridge\.exposeInMainWorld\(["']ps2["']/);
  assert.doesNotMatch(preload, /require\(["']node:(?:fs|child_process|net|http|https)["']\)/);
  assert.doesNotMatch(preload, /ipcRenderer\.send\s*\(|sendSync\s*\(/);

  const invoked = [...preload.matchAll(/ipcRenderer\.invoke\(["']([^"']+)["']/g)].map((match) => match[1]);
  const expected = [
    "state:get",
    "notice:accept",
    "preferences:update",
    "library:add-files",
    "library:add-folder",
    "library:remove",
    "library:toggle-favorite",
    "core:choose-modified",
    "core:use-standard",
    "core:open-download",
    "game:launch",
    "core:settings",
    "core:stop",
    "logs:show",
  ];
  assert.deepEqual([...new Set(invoked)].sort(), expected.sort());
  assert.deepEqual(
    [...preload.matchAll(/ipcRenderer\.on\(["']([^"']+)["']/g)].map((match) => match[1]),
    ["runtime:state"],
  );
});

test("PS2 Emu identity preserves the prior user-data path and requires hash-only acknowledgement", async () => {
  const appPackage = JSON.parse(await read("app/package.json"));
  const main = await read("app/main.mjs");
  const html = await read("app/renderer/index.html");
  const renderer = await read("app/renderer/renderer.js");
  assert.equal(appPackage.productName, "PS2 Emu");
  assert.equal(appPackage.author, "ten:ten");
  assert.match(main, /legacyUserDataDirectoryName = ["']PS2 Emulator["']/);
  assert.match(main, /app\.setPath\(["']userData["']/);
  assert.match(main, /app\.getPath\(["']system["']\)/);
  assert.match(main, /payload\?\.hashOnlyRiskAccepted !== true/);
  assert.match(html, /<title>PS2 Emu<\/title>/);
  assert.match(html, /data-notice-hash-only/);
  assert.match(renderer, /hashOnlyRiskAccepted:\s*elements\.noticeHashOnly\.checked/);
  assert.match(renderer, /standardHashWarning/);
});

test("app source has no updater, bootstrap download, analytics, or unexpected remote URL", async () => {
  const files = await sourceFiles(appRoot);
  const combined = (await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(combined, /electron-updater|autoUpdater|squirrel|velopack|\bfetch\s*\(|https?\.request\s*\(|net\.request\s*\(|new\s+WebSocket\s*\(/i);
  assert.doesNotMatch(combined, /google-analytics|googletagmanager|segment\.com|sentry\.io|mixpanel|amplitude/i);
  const urls = [...combined.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0]);
  assert.deepEqual([...new Set(urls)].sort(), [
    "https://purei.org/downloads.php",
    "https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play-x86-64.exe",
  ]);
});

test("build dependencies and package scripts stay local and updater-free", async () => {
  const packageJSON = JSON.parse(await read("package.json"));
  assert.equal(packageJSON.private, true);
  assert.equal(packageJSON.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(packageJSON.scripts["package:windows"], "node scripts/package-windows.mjs");
  assert.equal(packageJSON.scripts["verify:windows"], "node scripts/verify-windows-packages.mjs");
  assert.equal(packageJSON.devDependencies["@electron/packager"], "20.3.0");
  assert.equal(packageJSON.devDependencies.electron, "44.1.0");
  const dependencyNames = Object.keys({ ...packageJSON.dependencies, ...packageJSON.devDependencies });
  assert.equal(dependencyNames.some((name) => /updater|squirrel|velopack|telemetry|analytics/i.test(name)), false);
});

test("packaging specification binds exact unsigned names and PE machines", () => {
  assert.equal(
    PACKAGE_SPECS.x64.artifactName,
    "PS2-Emu-0.1.0-Windows-x64-UNSIGNED-DO-NOT-DISTRIBUTE.zip",
  );
  assert.equal(PACKAGE_SPECS.x64.machine, 0x8664);
  assert.equal(
    PACKAGE_SPECS.arm64.artifactName,
    "PS2-Emu-0.1.0-Windows-ARM64-UNSIGNED-DO-NOT-DISTRIBUTE.zip",
  );
  assert.equal(PACKAGE_SPECS.arm64.machine, 0xaa64);
  assert.equal(parsePEMachine(fakePE(0x8664)), 0x8664);
  assert.equal(parsePEMachine(fakePE(0xaa64)), 0xaa64);
});

test("ZIP path validation rejects traversal, duplicates, macOS metadata, and forbidden payloads", () => {
  const safe = validateArchiveEntryNames([
    "PS2 Emu-win32-x64/",
    "PS2 Emu-win32-x64/PS2 Emu.exe",
    "PS2 Emu-win32-x64/resources/",
    "PS2 Emu-win32-x64/resources/app.asar",
  ]);
  assert.equal(safe.root, "PS2 Emu-win32-x64");

  for (const entries of [
    ["../escape"],
    ["C:/absolute"],
    ["root/file", "ROOT/FILE"],
    ["root/__MACOSX/._file"],
    ["root/Play.exe"],
    ["root/Qt5Core.dll"],
    ["root/states.db"],
    ["root/game.iso"],
    ["root/signing.p12"],
    ["root/scph39001.bin"],
  ]) assert.throws(() => validateArchiveEntryNames(entries));
});

test("forbidden payload classification covers external core, games, BIOS, and credentials", () => {
  assert.equal(prohibitedPayloadReason("Play.exe"), "bundled Play.exe");
  assert.equal(prohibitedPayloadReason("platforms/Qt6Core.dll"), "bundled Qt runtime");
  assert.equal(prohibitedPayloadReason("states.db"), "bundled Play! compatibility database");
  assert.equal(prohibitedPayloadReason("games/demo.chd"), "bundled game or homebrew image");
  assert.equal(prohibitedPayloadReason("firmware/ps2-bios.bin"), "bundled BIOS file");
  assert.equal(prohibitedPayloadReason("codesign/release.pfx"), "bundled private key or signing credential");
  assert.equal(prohibitedPayloadReason("resources/app.asar"), null);
});

test("distribution warning and scripts preserve unsigned cross-package boundaries", async () => {
  const warning = await read("distribution/READ-ME-FIRST.txt");
  for (const required of [
    "UNSIGNED",
    "DO NOT DISTRIBUTE",
    "not been executed or tested on Windows",
    "does not include Play.exe",
    "Windows 11 on Arm",
    "HASH-ONLY",
    "publisher is unverified",
  ]) assert.equal(warning.includes(required), true, required);

  const packaging = await read("scripts/package-windows.mjs");
  const verifier = await read("scripts/verify-windows-packages.mjs");
  const wrapperLicense = await read("distribution/PS2-EMU-LICENSE.txt");
  assert.match(wrapperLicense, /^MIT License/);
  assert.match(wrapperLicense, /Copyright \(c\) 2026 ten:ten/);
  assert.match(packaging, /PS2-EMU-LICENSE\.txt/);
  assert.match(verifier, /PS2-EMU-LICENSE\.txt/);
  assert.match(packaging, /platform:\s*["']win32["']/);
  assert.match(packaging, /asar:\s*true/);
  assert.match(packaging, /PACKAGE_SPECS\.x64/);
  assert.match(packaging, /PACKAGE_SPECS\.arm64/);
  assert.match(packaging, /previous-windows-packages/);
  assert.match(packaging, /verifyWindowsPackage\(/);
  for (const [identityPath, identityFilename] of [
    ["core-identity-manifest.json", "core-identity-manifest.json"],
    ["lib/core-identity.mjs", "core-identity.mjs"],
    ["lib/windows-core-evidence.mjs", "windows-core-evidence.mjs"],
  ]) {
    assert.equal(packaging.includes(identityFilename), true, `packaging preflight: ${identityPath}`);
    assert.equal(verifier.includes(`\"${identityPath}\"`), true, `archive verification: ${identityPath}`);
  }
  assert.doesNotMatch(packaging, /codesign|signtool|authenticode/i);
});
