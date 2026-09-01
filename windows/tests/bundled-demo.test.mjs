import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_DEMO_FILE_NAME,
  BUNDLED_DEMO_RESOURCE_IDENTITIES,
  BUNDLED_DEMO_SHA256,
  bundledDemoPath,
  verifyBundledDemo,
  verifyBundledDemoDocument,
  verifyBundledDemoResourceSet,
} from "../app/lib/bundled-demo.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..", "..");
const reviewedFixture = path.join(projectRoot, "Resources", "Fixtures", "ps2sdk-cube.elf");

test("reviewed PS2SDK Cube Demo has the pinned exact identity", async () => {
  const verified = await verifyBundledDemo(reviewedFixture);
  assert.equal(verified.path, reviewedFixture);
  assert.equal(verified.sha256, BUNDLED_DEMO_SHA256);
  assert.equal(verified.size, 174_772);
  assert.equal(BUNDLED_DEMO_FILE_NAME, "ps2sdk-cube.elf");
  assert.equal(
    bundledDemoPath(path.resolve("/PS2 Emu/resources")),
    path.resolve("/PS2 Emu/resources/PS2SDK-Cube-Demo/ps2sdk-cube.elf"),
  );
});

test("bundled demo verification rejects changed bytes and symbolic links", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-bundled-demo-test-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const changed = path.join(temporaryDirectory, "changed.elf");
  await fs.copyFile(reviewedFixture, changed);
  const handle = await fs.open(changed, "r+");
  try {
    const byte = Buffer.alloc(1);
    await handle.read(byte, 0, 1, 0);
    byte[0] ^= 0xff;
    await handle.write(byte, 0, 1, 0);
  } finally {
    await handle.close();
  }
  await assert.rejects(verifyBundledDemo(changed), /size or SHA-256 is invalid/);

  if (process.platform !== "win32") {
    const linked = path.join(temporaryDirectory, "linked.elf");
    await fs.symlink(reviewedFixture, linked);
    await assert.rejects(verifyBundledDemo(linked), /regular non-symlink/);
  }
});

test("all bundled demo notices are exact before assent and when opened", async (t) => {
  const fixtureDirectory = path.join(projectRoot, "Resources", "Fixtures");
  const verified = await verifyBundledDemoResourceSet(fixtureDirectory);
  assert.deepEqual(
    Object.keys(verified).sort(),
    Object.keys(BUNDLED_DEMO_RESOURCE_IDENTITIES).sort(),
  );

  const licenseName = "PS2SDK-AFL-2.0.txt";
  const licensePath = path.join(fixtureDirectory, licenseName);
  const license = await verifyBundledDemoDocument(licensePath, licenseName);
  assert.equal(license.sha256, BUNDLED_DEMO_RESOURCE_IDENTITIES[licenseName].sha256);

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-demo-license-test-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const changed = path.join(temporaryDirectory, licenseName);
  await fs.copyFile(licensePath, changed);
  await fs.appendFile(changed, "tampered");
  await assert.rejects(
    verifyBundledDemoDocument(changed, licenseName),
    /size or SHA-256 is invalid/,
  );
  await assert.rejects(
    verifyBundledDemoDocument(licensePath, "unreviewed.txt"),
    /not on the reviewed allowlist/,
  );
});
