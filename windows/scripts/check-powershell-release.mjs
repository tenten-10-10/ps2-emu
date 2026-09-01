import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const releaseScript = path.join(scriptDirectory, "sign-windows-release.ps1");

if (process.platform !== "win32") {
  console.log("PowerShell AST check is exercised by the native Windows CI jobs.");
  process.exit(0);
}

const parserCommand = [
  "$tokens = $null",
  "$errors = $null",
  "[void][System.Management.Automation.Language.Parser]::ParseFile($env:PS2_RELEASE_SCRIPT_PATH, [ref]$tokens, [ref]$errors)",
  "if ($errors.Count -ne 0) {",
  "  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }",
  "  exit 1",
  "}",
].join("; ");

const result = spawnSync(
  "powershell.exe",
  ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", parserCommand],
  {
    encoding: "utf8",
    env: { ...process.env, PS2_RELEASE_SCRIPT_PATH: releaseScript },
    maxBuffer: 1024 * 1024,
  },
);

if (result.error) {
  console.error(`PowerShell AST check could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

console.log("PowerShell AST syntax check passed for sign-windows-release.ps1.");
