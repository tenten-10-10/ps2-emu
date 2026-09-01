import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { OFFICIAL_CORE_IDENTITY_FILES } from "./core-identity.mjs";
import { PE_MACHINE, isStandardCoreLocation, standardCorePath } from "./core.mjs";

const execFileAsync = promisify(execFile);
const maximumPowerShellOutput = 64 * 1024;

function fail(message) {
  throw new Error(message);
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

async function readPEMachine(filePath, fileSize) {
  const handle = await fs.open(filePath, "r");
  try {
    const dosHeader = Buffer.alloc(0x40);
    const first = await handle.read(dosHeader, 0, dosHeader.length, 0);
    if (first.bytesRead !== dosHeader.length || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) return null;
    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < 0x40 || peOffset > 16 * 1024 * 1024 || peOffset + 6 > fileSize) return null;
    const signature = Buffer.alloc(6);
    const second = await handle.read(signature, 0, signature.length, peOffset);
    if (
      second.bytesRead !== signature.length
      || signature[0] !== 0x50
      || signature[1] !== 0x45
      || signature[2] !== 0
      || signature[3] !== 0
    ) return null;
    return signature.readUInt16LE(4);
  } finally {
    await handle.close();
  }
}

function withinRoot(root, candidate) {
  const relative = path.win32.relative(root, candidate);
  return relative !== ""
    && !relative.startsWith("..")
    && !path.win32.isAbsolute(relative);
}

const approvedInstallCodePaths = new Set([
  ...OFFICIAL_CORE_IDENTITY_FILES,
  "uninstall.exe",
].map((filePath) => filePath.toLocaleLowerCase("en-US")));
const executableInstallExtensions = new Set([
  ".asi",
  ".com",
  ".cpl",
  ".dll",
  ".drv",
  ".exe",
  ".node",
  ".ocx",
  ".plugin",
  ".scr",
  ".sys",
]);

export function isUnexpectedInstallCodePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) return true;
  const canonical = relativePath.replaceAll("\\", "/");
  if (
    canonical.startsWith("/")
    || /^[A-Za-z]:/.test(canonical)
    || canonical.split("/").some((component) => !component || component === "." || component === "..")
  ) return true;
  const normalized = canonical.toLocaleLowerCase("en-US");
  const extension = path.posix.extname(normalized);
  return executableInstallExtensions.has(extension) && !approvedInstallCodePaths.has(normalized);
}

async function assertNoUnexpectedInstallCode(installRoot) {
  const queue = [{ directory: installRoot, depth: 0 }];
  let entryCount = 0;
  while (queue.length > 0) {
    const { directory, depth } = queue.shift();
    if (depth > 12) fail("Play! installation exceeds the allowed directory depth.");
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      entryCount += 1;
      if (entryCount > 4096) fail("Play! installation exceeds the allowed entry count.");
      const candidate = path.win32.join(directory, entry.name);
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) fail(`Play! installation contains a symbolic link or junction: ${entry.name}.`);
      const relative = path.win32.relative(installRoot, candidate).replaceAll("\\", "/");
      if (!withinRoot(installRoot, candidate)) fail(`Play! installation entry escapes its root: ${relative}.`);
      if (stat.isDirectory()) {
        queue.push({ directory: candidate, depth: depth + 1 });
      } else if (!stat.isFile()) {
        fail(`Play! installation contains a non-file object: ${relative}.`);
      } else if (isUnexpectedInstallCodePath(relative)) {
        fail(`Play! installation contains unapproved executable code: ${relative}.`);
      }
    }
  }
}

export async function collectIdentityFiles(installRoot) {
  if (typeof installRoot !== "string" || !path.win32.isAbsolute(installRoot)) {
    fail("Play! install root must be an absolute Windows path.");
  }
  const rootStat = await fs.lstat(installRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("Play! install root must be a regular non-symlink directory.");
  }
  const realRoot = await fs.realpath(installRoot);
  await assertNoUnexpectedInstallCode(realRoot);
  const collected = [];
  for (const relativePath of OFFICIAL_CORE_IDENTITY_FILES) {
    const candidate = path.win32.join(realRoot, ...relativePath.split("/"));
    const stat = await fs.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
      fail(`Identity file is missing, empty, or not a regular file: ${relativePath}.`);
    }
    const realCandidate = await fs.realpath(candidate);
    if (!withinRoot(realRoot, realCandidate)) {
      fail(`Identity file escapes the Play! installation: ${relativePath}.`);
    }
    const machine = await readPEMachine(realCandidate, stat.size);
    if (machine !== PE_MACHINE.x64) {
      const rendered = machine === null ? "invalid PE" : `0x${machine.toString(16)}`;
      fail(`${relativePath} is not an x64 PE file: ${rendered}.`);
    }
    collected.push(Object.freeze({
      path: relativePath,
      size: stat.size,
      sha256: await sha256File(realCandidate),
      machine: "x64",
    }));
  }
  return Object.freeze({ installRoot: realRoot, files: Object.freeze(collected) });
}

const POWERSHELL_IDENTITY_COMMAND = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$target = $env:PS2_CORE_IDENTITY_PATH
if ([String]::IsNullOrWhiteSpace($target)) { throw 'PS2_CORE_IDENTITY_PATH is missing.' }
$signature = Get-AuthenticodeSignature -LiteralPath $target
$certificate = $signature.SignerCertificate
$certificateSha256 = $null
if ($null -ne $certificate) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $certificateSha256 = ([BitConverter]::ToString($sha256.ComputeHash($certificate.RawData))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}
$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($target)
$registryDisplayVersion = $null
$registryPath = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Play'
if (Test-Path -LiteralPath $registryPath) {
  $registryDisplayVersion = (Get-ItemProperty -LiteralPath $registryPath -Name DisplayVersion -ErrorAction Stop).DisplayVersion
}
[ordered]@{
  registryDisplayVersion = $registryDisplayVersion
  publisher = [ordered]@{
    status = [string]$signature.Status
    signerCertificateSha256 = $certificateSha256
    subject = if ($null -eq $certificate) { $null } else { [string]$certificate.Subject }
  }
  versionInfo = [ordered]@{
    productName = if ([String]::IsNullOrWhiteSpace($version.ProductName)) { $null } else { [string]$version.ProductName }
    productVersion = if ([String]::IsNullOrWhiteSpace($version.ProductVersion)) { $null } else { [string]$version.ProductVersion }
    fileVersion = if ([String]::IsNullOrWhiteSpace($version.FileVersion)) { $null } else { [string]$version.FileVersion }
    originalFilename = if ([String]::IsNullOrWhiteSpace($version.OriginalFilename)) { $null } else { [string]$version.OriginalFilename }
  }
} | ConvertTo-Json -Depth 4 -Compress
`;

function validatePowerShellEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PowerShell returned invalid identity evidence.");
  const expectedTop = ["publisher", "registryDisplayVersion", "versionInfo"];
  const actualTop = Object.keys(value).sort();
  if (actualTop.length !== expectedTop.length || actualTop.some((key, index) => key !== expectedTop[index])) {
    fail("PowerShell identity evidence has unexpected or missing fields.");
  }
  if (!value.publisher || typeof value.publisher !== "object" || Array.isArray(value.publisher)) {
    fail("PowerShell publisher evidence is invalid.");
  }
  if (!value.versionInfo || typeof value.versionInfo !== "object" || Array.isArray(value.versionInfo)) {
    fail("PowerShell version evidence is invalid.");
  }
  return value;
}

export async function queryWindowsIdentity(
  playPath,
  {
    platform = process.platform,
    environment = process.env,
    systemDirectory = null,
    execute = execFileAsync,
  } = {},
) {
  if (platform !== "win32") fail("Authenticode and version evidence must be collected on Windows.");
  if (typeof playPath !== "string" || !path.win32.isAbsolute(playPath)) {
    fail("Play.exe identity path must be an absolute Windows path.");
  }
  let resolvedSystemDirectory = systemDirectory;
  if (resolvedSystemDirectory === null) {
    const systemRoot = environment.SystemRoot || environment.WINDIR;
    if (typeof systemRoot !== "string" || !path.win32.isAbsolute(systemRoot)) {
      fail("A valid Windows SystemRoot is required for PowerShell identity verification.");
    }
    resolvedSystemDirectory = path.win32.join(systemRoot, "System32");
  }
  if (typeof resolvedSystemDirectory !== "string" || !path.win32.isAbsolute(resolvedSystemDirectory)) {
    fail("A valid Windows system directory is required for PowerShell identity verification.");
  }
  const powershell = path.win32.join(resolvedSystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = await execute(
    powershell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_IDENTITY_COMMAND],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: maximumPowerShellOutput,
      env: { ...environment, PS2_CORE_IDENTITY_PATH: playPath },
    },
  );
  if (typeof result?.stdout !== "string" || result.stdout.length === 0 || result.stdout.length >= maximumPowerShellOutput) {
    fail("PowerShell returned empty or oversized identity evidence.");
  }
  if (typeof result.stderr === "string" && result.stderr.trim().length > 0) {
    fail("PowerShell emitted unexpected stderr while collecting identity evidence.");
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    fail("PowerShell identity evidence was not valid JSON.");
  }
  return validatePowerShellEvidence(parsed);
}

export async function collectWindowsCoreEvidence(
  candidate = standardCorePath(),
  options = {},
) {
  if (options.platform !== undefined && options.platform !== "win32") {
    fail("Official Windows core evidence can only be collected on Windows.");
  }
  if (process.platform !== "win32" && options.platform === undefined) {
    fail("Official Windows core evidence can only be collected on Windows.");
  }
  if (!candidate || !isStandardCoreLocation(candidate, options.environment || process.env)) {
    fail("Official core evidence must come from %ProgramFiles%\\Play\\Play.exe.");
  }
  const installRoot = path.win32.dirname(candidate);
  const fileEvidence = await collectIdentityFiles(installRoot);
  const playPath = path.win32.join(fileEvidence.installRoot, "Play.exe");
  const windowsEvidence = await queryWindowsIdentity(playPath, options);
  return Object.freeze({
    schemaVersion: 1,
    installRoot: fileEvidence.installRoot,
    registryDisplayVersion: windowsEvidence.registryDisplayVersion ?? null,
    publisher: Object.freeze({
      status: windowsEvidence.publisher.status ?? null,
      signerCertificateSha256: windowsEvidence.publisher.signerCertificateSha256 ?? null,
      subject: windowsEvidence.publisher.subject ?? null,
    }),
    versionInfo: Object.freeze({
      productName: windowsEvidence.versionInfo.productName ?? null,
      productVersion: windowsEvidence.versionInfo.productVersion ?? null,
      fileVersion: windowsEvidence.versionInfo.fileVersion ?? null,
      originalFilename: windowsEvidence.versionInfo.originalFilename ?? null,
    }),
    files: fileEvidence.files,
  });
}
