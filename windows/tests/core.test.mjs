import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  OFFICIAL_PLAY_DOWNLOAD_URL,
  PE_MACHINE,
  canRunX64PlayCore,
  commandArguments,
  displayTitle,
  isAllowedExternalURL,
  isStandardCoreLocation,
  isSupportedWindowsGamePath,
  modifiedCoreConsentKey,
  parsePEMachine,
  standardCorePath,
  validateWindowsCore,
  windowsBuildNumber,
} from "../app/lib/core.mjs";

function fakePE(machine, size = 1024, peOffset = 0x80) {
  const buffer = Buffer.alloc(size);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(peOffset, 0x3c);
  buffer.write("PE\0\0", peOffset, "binary");
  buffer.writeUInt16LE(machine, peOffset + 4);
  return buffer;
}

function mockCoreFileSystem(t, machine, options = {}) {
  const bytes = fakePE(machine);
  t.mock.method(fs, "lstat", async () => ({
    isFile: () => options.isFile !== false,
    isSymbolicLink: () => options.symbolicLink === true,
    size: options.size ?? 1024 * 1024,
  }));
  t.mock.method(fs, "realpath", async (candidate) => candidate);
  t.mock.method(fs, "open", async () => ({
    read: async (target, offset, length, position) => {
      if (position >= bytes.length) return { bytesRead: 0, buffer: target };
      const bytesRead = Math.min(length, bytes.length - position);
      bytes.copy(target, offset, position, position + bytesRead);
      return { bytesRead, buffer: target };
    },
    close: async () => {},
  }));
}

test("Windows release parsing and x64-core compatibility fail closed", () => {
  assert.equal(windowsBuildNumber("10.0.19045"), 19_045);
  assert.equal(windowsBuildNumber("10.0.22000"), 22_000);
  assert.equal(windowsBuildNumber("10.0.26100.1"), 26_100);
  for (const invalid of [null, "", "10.0", "10.0.build", "10..22000", `10.0.${"9".repeat(32)}`]) {
    assert.equal(windowsBuildNumber(invalid), null, String(invalid));
  }

  assert.equal(canRunX64PlayCore({ platform: "win32", architecture: "x64", release: "10.0.1" }), true);
  assert.equal(canRunX64PlayCore({ platform: "win32", architecture: "arm64", release: "10.0.22000" }), true);
  assert.equal(canRunX64PlayCore({ platform: "win32", architecture: "arm64", release: "10.0.21999" }), false);
  assert.equal(canRunX64PlayCore({ platform: "win32", architecture: "ia32", release: "10.0.26100" }), false);
  assert.equal(canRunX64PlayCore({ platform: "darwin", architecture: "arm64", release: "24.6.0" }), false);
});

test("parsePEMachine recognizes exact machine values and rejects malformed headers", () => {
  assert.equal(parsePEMachine(fakePE(PE_MACHINE.x86)), PE_MACHINE.x86);
  assert.equal(parsePEMachine(fakePE(PE_MACHINE.x64)), PE_MACHINE.x64);
  assert.equal(parsePEMachine(fakePE(PE_MACHINE.arm64)), PE_MACHINE.arm64);
  assert.equal(parsePEMachine(fakePE(0xffff)), 0xffff);
  assert.equal(parsePEMachine(Buffer.from("not a PE")), null);

  const badDOS = fakePE(PE_MACHINE.x64);
  badDOS.write("NZ", 0, "ascii");
  assert.equal(parsePEMachine(badDOS), null);

  const badPE = fakePE(PE_MACHINE.x64);
  badPE.write("PX\0\0", 0x80, "binary");
  assert.equal(parsePEMachine(badPE), null);

  const unsafeOffset = fakePE(PE_MACHINE.x64);
  unsafeOffset.writeUInt32LE(unsafeOffset.length + 1, 0x3c);
  assert.equal(parsePEMachine(unsafeOffset), null);

  const belowHeader = fakePE(PE_MACHINE.x64);
  belowHeader.writeUInt32LE(0x3f, 0x3c);
  assert.equal(parsePEMachine(belowHeader), null);

  assert.equal(parsePEMachine(fakePE(PE_MACHINE.x64, 70, 64)), PE_MACHINE.x64);
  const truncated = fakePE(PE_MACHINE.x64, 70, 64).subarray(0, 69);
  assert.equal(parsePEMachine(truncated), null);
});

test("commandArguments keeps the game path as one argument and selects ELF mode", () => {
  const disc = "C:\\Games\\odd & ! % \\\" title.iso";
  assert.deepEqual(commandArguments(disc, true), ["--disc", disc, "--fullscreen"]);

  const elf = "C:\\Homebrew\\demo.ELF";
  assert.deepEqual(commandArguments(elf), ["--elf", elf]);
  assert.throws(() => commandArguments("C:\\Games\\notes.txt"), /Unsupported game extension/);
});

test("Windows game-path filtering is absolute, bounded, and extension allow-listed", () => {
  assert.equal(isSupportedWindowsGamePath("C:\\Games\\game.iso"), true);
  assert.equal(isSupportedWindowsGamePath("D:\\合法\\demo.CHD"), true);
  assert.equal(isSupportedWindowsGamePath("relative\\game.iso"), false);
  assert.equal(isSupportedWindowsGamePath("C:\\Games\\game.exe"), false);
  assert.equal(isSupportedWindowsGamePath(`C:\\${"a".repeat(32_768)}.iso`), false);
});

test("standard Play! location uses only an absolute 64-bit Program Files path", () => {
  const environment = {
    ProgramW6432: "C:\\Program Files",
    ProgramFiles: "C:\\Program Files (x86)",
  };
  assert.equal(standardCorePath(environment), "C:\\Program Files\\Play\\Play.exe");
  assert.equal(
    isStandardCoreLocation("c:\\PROGRAM FILES\\Play\\Play.exe\\", environment),
    true,
  );
  assert.equal(isStandardCoreLocation("C:\\Other\\Play.exe", environment), false);
  assert.equal(standardCorePath({ ProgramW6432: "relative" }), null);
});

test("external navigation accepts only the exact official HTTPS download URL", () => {
  assert.equal(isAllowedExternalURL(OFFICIAL_PLAY_DOWNLOAD_URL), true);
  for (const rejected of [
    "http://purei.org/downloads.php",
    "https://www.purei.org/downloads.php",
    "https://purei.org/downloads.php?next=https://example.com",
    "https://purei.org/downloads.php#fragment",
    "https://purei.org.evil.example/downloads.php",
    "https://user@purei.org/downloads.php",
  ]) assert.equal(isAllowedExternalURL(rejected), false, rejected);
});

test("modified-core validation accepts only an x64 PE and returns its digest", async (t) => {
  mockCoreFileSystem(t, PE_MACHINE.x64);
  const result = await validateWindowsCore("C:\\Custom\\Play.exe", { mode: "modified" });
  assert.equal(result.path, "C:\\Custom\\Play.exe");
  assert.equal(result.machine, "x64");
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test("modified-core consent is bound to both normalized path and SHA-256", () => {
  const approved = modifiedCoreConsentKey({
    path: "C:\\Custom\\Play.exe",
    sha256: "a".repeat(64),
  });
  assert.match(approved, /^[0-9a-f]{64}$/);
  assert.equal(
    approved,
    modifiedCoreConsentKey({ path: "c:\\custom\\PLAY.EXE", sha256: "a".repeat(64) }),
  );
  assert.notEqual(
    approved,
    modifiedCoreConsentKey({ path: "D:\\Custom\\Play.exe", sha256: "a".repeat(64) }),
  );
  assert.notEqual(
    approved,
    modifiedCoreConsentKey({ path: "C:\\Custom\\Play.exe", sha256: "b".repeat(64) }),
  );
  assert.throws(
    () => modifiedCoreConsentKey({ path: "relative\\Play.exe", sha256: "a".repeat(64) }),
    /absolute path and SHA-256/,
  );
});

test("modified-core validation rejects an ARM64 PE", async (t) => {
  mockCoreFileSystem(t, PE_MACHINE.arm64);
  await assert.rejects(
    validateWindowsCore("C:\\Custom\\Play.exe", { mode: "modified" }),
    /must be an x64 PE executable/,
  );
});

test("standard-core structure requires every pinned Play! and Qt identity file", async (t) => {
  const bytes = fakePE(PE_MACHINE.x64);
  const observed = [];
  t.mock.method(fs, "lstat", async (candidate) => {
    observed.push(candidate);
    return {
      isFile: () => true,
      isSymbolicLink: () => false,
      size: 1024 * 1024,
    };
  });
  t.mock.method(fs, "realpath", async (candidate) => candidate);
  t.mock.method(fs, "open", async () => ({
    read: async (target, offset, length, position) => {
      if (position >= bytes.length) return { bytesRead: 0, buffer: target };
      const bytesRead = Math.min(length, bytes.length - position);
      bytes.copy(target, offset, position, position + bytesRead);
      return { bytesRead, buffer: target };
    },
    close: async () => {},
  }));
  const environment = { ProgramW6432: "C:\\Program Files" };
  await validateWindowsCore("C:\\Program Files\\Play\\Play.exe", {
    mode: "official",
    environment,
  });
  for (const relative of [
    "Play.exe",
    "Qt5Core.dll",
    "Qt5Gui.dll",
    "Qt5Widgets.dll",
    "platforms\\qwindows.dll",
    "styles\\qwindowsvistastyle.dll",
    "imageformats\\qjpeg.dll",
  ]) {
    assert.equal(
      observed.some((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(relative.toLocaleLowerCase("en-US"))),
      true,
      relative,
    );
  }
});

test("core validation rejects symbolic links, relative paths, and unknown modes", async (t) => {
  await assert.rejects(validateWindowsCore("relative\\Play.exe", { mode: "modified" }), /absolute Windows path/);
  await assert.rejects(validateWindowsCore("C:\\Play.exe", { mode: "anything" }), /Unknown core validation mode/);

  mockCoreFileSystem(t, PE_MACHINE.x64, { symbolicLink: true });
  await assert.rejects(
    validateWindowsCore("C:\\Custom\\Play.exe", { mode: "modified" }),
    /regular non-symlink file/,
  );
});

test("displayTitle removes control characters and enforces a bounded fallback", () => {
  assert.equal(displayTitle("C:\\Games\\A\u0000B\u001fC.iso"), "A B C");
  assert.equal(displayTitle("C:\\Games\\\u0000.iso"), "Untitled game");
  assert.equal(displayTitle(`C:\\Games\\${"x".repeat(300)}.iso`).length, 180);
});
