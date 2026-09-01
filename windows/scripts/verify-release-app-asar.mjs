import fs from "node:fs/promises";
import path from "node:path";
import { verifyReviewedAppAsar } from "./verify-windows-packages.mjs";

function fail(message) {
  throw new Error(message);
}

const [asarArgument, ...unexpectedArguments] = process.argv.slice(2);
if (!asarArgument || unexpectedArguments.length !== 0 || !path.isAbsolute(asarArgument)) {
  fail("Expected exactly one absolute app.asar path.");
}

const asarStat = await fs.lstat(asarArgument).catch(() => null);
if (!asarStat?.isFile() || asarStat.isSymbolicLink() || asarStat.size < 1000) {
  fail("The reviewed app.asar is missing, too small, or not a regular file.");
}

await verifyReviewedAppAsar(asarArgument);
console.log("Reviewed app.asar matches the exact public source allowlist.");
