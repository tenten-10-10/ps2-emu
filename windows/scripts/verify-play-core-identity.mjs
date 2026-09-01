import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyOfficialCoreIdentity } from "../app/lib/core-identity.mjs";
import { standardCorePath } from "../app/lib/core.mjs";
import { collectWindowsCoreEvidence } from "./lib/windows-core-evidence.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(scriptDirectory, "..", "app", "core-identity-manifest.json");

async function main() {
  if (process.argv.length > 3) {
    throw new Error("Usage: node scripts/verify-play-core-identity.mjs [absolute-Play.exe-path]");
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const candidate = process.argv[2] || standardCorePath();
  if (!candidate) throw new Error("Official Play! x64 was not found in Program Files.");
  const evidence = await collectWindowsCoreEvidence(candidate);
  const verified = verifyOfficialCoreIdentity(evidence, manifest);
  console.log(`verified Play! ${verified.version} (${verified.releaseID})`);
  console.log(`  upstreamCommit=${verified.upstreamCommit}`);
  console.log(`  Play.exe sha256=${verified.playSha256}`);
  console.log(`  verificationMode=${verified.verificationMode}`);
  console.log(`  publisherVerified=${verified.publisherVerified}`);
  console.log(`  publisher=${verified.publisherSubject ?? "unverified (unsigned)"}`);
  console.log(`  identityKey=${verified.identityKey}`);
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  main().catch((error) => {
    console.error(`Official Play! identity verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
