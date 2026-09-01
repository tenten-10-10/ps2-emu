import path from "node:path";
import { fileURLToPath } from "node:url";
import { standardCorePath } from "../app/lib/core.mjs";
import { collectWindowsCoreEvidence } from "./lib/windows-core-evidence.mjs";

async function main() {
  if (process.argv.length > 3) throw new Error("Usage: node scripts/inspect-play-core.mjs [absolute-Play.exe-path]");
  const candidate = process.argv[2] || standardCorePath();
  if (!candidate) throw new Error("Official Play! x64 was not found in Program Files.");
  const evidence = await collectWindowsCoreEvidence(candidate);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  main().catch((error) => {
    console.error(`Play! identity inspection failed: ${error.message}`);
    process.exitCode = 1;
  });
}
