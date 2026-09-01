import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const PE_MACHINE = Object.freeze({
  x86: 0x014c,
  x64: 0x8664,
  arm64: 0xaa64,
});

export const SUPPORTED_EXTENSIONS = Object.freeze([
  ".iso",
  ".mds",
  ".isz",
  ".cso",
  ".cue",
  ".chd",
  ".elf",
]);

export const OFFICIAL_PLAY_DOWNLOAD_URL = "https://purei.org/downloads.php";

export function windowsBuildNumber(release) {
  if (typeof release !== "string") return null;
  const parts = release.split(".");
  if (parts.length < 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const build = Number(parts[2]);
  return Number.isSafeInteger(build) ? build : null;
}

export function canRunX64PlayCore({ platform, architecture, release }) {
  if (platform !== "win32") return false;
  if (architecture === "x64") return true;
  if (architecture !== "arm64") return false;
  const build = windowsBuildNumber(release);
  return build !== null && build >= 22_000;
}

const REQUIRED_OFFICIAL_CORE_FILES = Object.freeze([
  "Play.exe",
  "Qt5Core.dll",
  "Qt5Gui.dll",
  "Qt5Widgets.dll",
  path.win32.join("platforms", "qwindows.dll"),
  path.win32.join("styles", "qwindowsvistastyle.dll"),
  path.win32.join("imageformats", "qjpeg.dll"),
]);

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

export function commandArguments(gamePath, fullscreen = false) {
  const extension = path.win32.extname(gamePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported game extension: ${extension || "none"}`);
  }
  const mode = extension === ".elf" ? "--elf" : "--disc";
  return fullscreen ? [mode, gamePath, "--fullscreen"] : [mode, gamePath];
}

export function isSupportedWindowsGamePath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 32_767) return false;
  if (!path.win32.isAbsolute(candidate)) return false;
  return SUPPORTED_EXTENSIONS.includes(path.win32.extname(candidate).toLowerCase());
}

export function standardCorePath(environment = process.env) {
  const programFiles = environment.ProgramW6432 || environment.ProgramFiles;
  if (typeof programFiles !== "string" || !path.win32.isAbsolute(programFiles)) return null;
  return path.win32.join(programFiles, "Play", "Play.exe");
}

function normalizedWindowsPath(candidate) {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");
}

export function modifiedCoreConsentKey(core) {
  if (
    !core
    || typeof core.path !== "string"
    || !path.win32.isAbsolute(core.path)
    || typeof core.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(core.sha256)
  ) throw new Error("A custom-core consent key requires an absolute path and SHA-256.");
  const binding = `${normalizedWindowsPath(core.path)}\0${core.sha256}`;
  return crypto.createHash("sha256").update(binding, "utf8").digest("hex");
}

export function isStandardCoreLocation(candidate, environment = process.env) {
  const expected = standardCorePath(environment);
  if (!expected || typeof candidate !== "string") return false;
  return normalizedWindowsPath(candidate) === normalizedWindowsPath(expected);
}

export function isAllowedExternalURL(candidate) {
  if (candidate !== OFFICIAL_PLAY_DOWNLOAD_URL) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:"
      && parsed.hostname === "purei.org"
      && parsed.pathname === "/downloads.php"
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

async function readPEHeader(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function regularNonSymlink(filePath) {
  const stat = await fs.lstat(filePath);
  return stat.isFile() && !stat.isSymbolicLink();
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

function fileIdentity(stat) {
  return Object.freeze({
    dev: Number.isSafeInteger(stat.dev) ? stat.dev : null,
    ino: Number.isSafeInteger(stat.ino) ? stat.ino : null,
    size: Number.isSafeInteger(stat.size) ? stat.size : null,
    mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null,
    ctimeMs: Number.isFinite(stat.ctimeMs) ? stat.ctimeMs : null,
    birthtimeMs: Number.isFinite(stat.birthtimeMs) ? stat.birthtimeMs : null,
  });
}

function sameFileIdentity(left, right) {
  return ["dev", "ino", "size", "mtimeMs", "ctimeMs", "birthtimeMs"]
    .every((field) => left[field] === right[field]);
}

export async function assertCoreExecutableIdentity(core) {
  if (!core || typeof core.path !== "string" || !core.fileIdentity) {
    throw new Error("Core executable identity snapshot is missing.");
  }
  const stat = await fs.lstat(core.path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Play.exe changed into a non-regular file before launch.");
  }
  if (!sameFileIdentity(core.fileIdentity, fileIdentity(stat))) {
    throw new Error("Play.exe filesystem identity changed before launch.");
  }
}

export async function validateWindowsCore(
  candidate,
  { mode = "official", environment = process.env } = {},
) {
  if (typeof candidate !== "string" || !path.win32.isAbsolute(candidate)) {
    throw new Error("Play.exe must use an absolute Windows path.");
  }
  if (mode !== "official" && mode !== "modified") {
    throw new Error("Unknown core validation mode.");
  }

  const stat = await fs.lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Play.exe must be a regular non-symlink file.");
  }
  if (stat.size < 512 * 1024 || stat.size > 512 * 1024 * 1024) {
    throw new Error("Play.exe size is outside the allowed safety range.");
  }

  const realCandidate = await fs.realpath(candidate);
  if (mode === "official" && !isStandardCoreLocation(realCandidate, environment)) {
    throw new Error("The standard core must be installed at %ProgramFiles%\\Play\\Play.exe.");
  }

  const beforeHashStat = await fs.lstat(realCandidate);
  if (!beforeHashStat.isFile() || beforeHashStat.isSymbolicLink()) {
    throw new Error("Play.exe must remain a regular non-symlink file.");
  }
  const machine = parsePEMachine(await readPEHeader(realCandidate));
  if (machine !== PE_MACHINE.x64) {
    throw new Error("The supported Windows Play! core must be an x64 PE executable.");
  }

  if (mode === "official") {
    const installRoot = path.win32.dirname(realCandidate);
    for (const relativePath of REQUIRED_OFFICIAL_CORE_FILES) {
      const dependency = path.win32.join(installRoot, relativePath);
      if (!(await regularNonSymlink(dependency))) {
        throw new Error(`The official Play! installation is incomplete: ${relativePath}`);
      }
      const realDependency = await fs.realpath(dependency);
      const relative = path.win32.relative(installRoot, realDependency);
      if (relative.startsWith("..") || path.win32.isAbsolute(relative)) {
        throw new Error(`Play! dependency escapes its installation directory: ${relativePath}`);
      }
    }
  }

  const digest = await sha256File(realCandidate);
  const afterHashStat = await fs.lstat(realCandidate);
  const beforeIdentity = fileIdentity(beforeHashStat);
  const afterIdentity = fileIdentity(afterHashStat);
  if (!afterHashStat.isFile() || afterHashStat.isSymbolicLink() || !sameFileIdentity(beforeIdentity, afterIdentity)) {
    throw new Error("Play.exe filesystem identity changed while it was being verified.");
  }

  return Object.freeze({
    path: realCandidate,
    mode,
    machine: "x64",
    sha256: digest,
    fileIdentity: afterIdentity,
  });
}

export function displayTitle(filePath) {
  const base = path.win32.basename(filePath, path.win32.extname(filePath));
  return base.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180) || "Untitled game";
}
