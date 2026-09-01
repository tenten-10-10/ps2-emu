import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyBundledDemoResources } from "../scripts/verify-windows-packages.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..", "..");
const fixtureSource = path.join(projectRoot, "Resources", "Fixtures");
const fixtureNames = Object.freeze([
  "ps2sdk-cube.elf",
  "PS2SDK-AFL-2.0.txt",
  "PS2SDK-CUBE-NOTICE.md",
  "NEWLIB-COPYING.txt",
  "GCC-COPYING.RUNTIME.txt",
  "GCC-COPYING3.txt",
]);

async function createPackageRoot(t) {
  const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-package-fixture-test-"));
  t.after(() => fs.rm(packageRoot, { recursive: true, force: true }));
  const packagedFixture = path.join(packageRoot, "resources", "PS2SDK-Cube-Demo");
  await fs.mkdir(packagedFixture, { recursive: true });
  for (const name of fixtureNames) {
    await fs.copyFile(path.join(fixtureSource, name), path.join(packagedFixture, name));
  }
  return { packageRoot, packagedFixture };
}

test("package fixture verifier requires exact source bytes and pinned ELF SHA-256", async (t) => {
  const { packageRoot, packagedFixture } = await createPackageRoot(t);
  await verifyBundledDemoResources(packageRoot);

  const elfPath = path.join(packagedFixture, "ps2sdk-cube.elf");
  const bytes = await fs.readFile(elfPath);
  bytes[0] ^= 0xff;
  await fs.writeFile(elfPath, bytes);
  await assert.rejects(
    verifyBundledDemoResources(packageRoot),
    /PS2SDK Cube Demo SHA-256 mismatch/,
  );
});

test("package fixture verifier rejects missing, renamed, and additional resources", async (t) => {
  const { packageRoot, packagedFixture } = await createPackageRoot(t);
  await fs.writeFile(path.join(packagedFixture, "extra.txt"), "not reviewed\n");
  await assert.rejects(verifyBundledDemoResources(packageRoot), /inventory is not exact/);
  await fs.rm(path.join(packagedFixture, "extra.txt"));

  await fs.rename(
    path.join(packagedFixture, "PS2SDK-AFL-2.0.txt"),
    path.join(packagedFixture, "license.txt"),
  );
  await assert.rejects(verifyBundledDemoResources(packageRoot), /inventory is not exact/);
});
