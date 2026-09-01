import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const BUNDLED_DEMO_ID = "ps2sdk-cube-demo";
export const BUNDLED_DEMO_TITLE = "PS2SDK Cube Demo";
export const BUNDLED_DEMO_DIRECTORY_NAME = "PS2SDK-Cube-Demo";
export const BUNDLED_DEMO_FILE_NAME = "ps2sdk-cube.elf";
export const BUNDLED_DEMO_SHA256 = "1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584";
// SHA-256 of the exact display name, upstream revision, ELF identity, license
// identifier, and AFL text identity. Changing any assent-visible input requires
// a new affirmative acceptance instead of inheriting an older boolean.
export const BUNDLED_DEMO_TERMS_REVISION = "c1bb50e290d391277fa8ab117d8edaad68d736aa5f0a6e93639ad58951cda59c";
export const BUNDLED_DEMO_RESOURCE_IDENTITIES = Object.freeze({
  [BUNDLED_DEMO_FILE_NAME]: Object.freeze({
    label: "bundled PS2SDK Cube Demo",
    sha256: BUNDLED_DEMO_SHA256,
    size: 174_772,
  }),
  "PS2SDK-AFL-2.0.txt": Object.freeze({
    label: "bundled PS2SDK AFL 2.0 license",
    sha256: "1ecee940922a6886baccddd9133d17f1ce677d32c5a954fac8e48224f2766fe8",
    size: 9_005,
  }),
  "PS2SDK-CUBE-NOTICE.md": Object.freeze({
    label: "bundled PS2SDK Cube Demo notice",
    sha256: "09929c9d0bd105afd0d25e65c254871181965f25dc780959134260810c8a7314",
    size: 6_661,
  }),
  "NEWLIB-COPYING.txt": Object.freeze({
    label: "bundled newlib license collection",
    sha256: "f3afe48e4bc6ed8466a42e9dacb6be1d8f9cbf5aac15cb8e474a5ccde8b40ef6",
    size: 78_388,
  }),
  "GCC-COPYING.RUNTIME.txt": Object.freeze({
    label: "bundled GCC Runtime Library Exception",
    sha256: "9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74",
    size: 3_324,
  }),
  "GCC-COPYING3.txt": Object.freeze({
    label: "bundled GCC GPLv3 license",
    sha256: "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903",
    size: 35_147,
  }),
});

export function bundledDemoPath(resourcesDirectory) {
  if (typeof resourcesDirectory !== "string" || !path.isAbsolute(resourcesDirectory)) {
    throw new Error("The bundled demo resources directory must be absolute.");
  }
  return path.join(resourcesDirectory, BUNDLED_DEMO_DIRECTORY_NAME, BUNDLED_DEMO_FILE_NAME);
}

function fileIdentity(stat) {
  return Object.freeze({
    dev: Number.isSafeInteger(stat.dev) ? stat.dev : null,
    ino: Number.isSafeInteger(stat.ino) ? stat.ino : null,
    size: Number.isSafeInteger(stat.size) ? stat.size : null,
    mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null,
    ctimeMs: Number.isFinite(stat.ctimeMs) ? stat.ctimeMs : null,
  });
}

function sameFileIdentity(left, right) {
  return ["dev", "ino", "size", "mtimeMs", "ctimeMs"]
    .every((field) => left[field] === right[field]);
}

async function verifyPinnedResource(candidate, identity) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
    throw new Error(`The ${identity.label} path must be absolute.`);
  }

  const before = await fs.lstat(candidate);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`The ${identity.label} must be a regular non-symlink file.`);
  }

  const handle = await fs.open(candidate, "r");
  let digest;
  let openedIdentity;
  try {
    const openedBefore = await handle.stat();
    if (!openedBefore.isFile()) {
      throw new Error(`The ${identity.label} is not a regular file.`);
    }
    openedIdentity = fileIdentity(openedBefore);
    if (!sameFileIdentity(fileIdentity(before), openedIdentity)) {
      throw new Error(`The ${identity.label} changed before verification.`);
    }

    const hash = crypto.createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    digest = hash.digest("hex");

    const openedAfter = await handle.stat();
    if (!openedAfter.isFile() || !sameFileIdentity(openedIdentity, fileIdentity(openedAfter))) {
      throw new Error(`The ${identity.label} changed while it was being verified.`);
    }
  } finally {
    await handle.close();
  }

  const after = await fs.lstat(candidate);
  if (!after.isFile() || after.isSymbolicLink() || !sameFileIdentity(openedIdentity, fileIdentity(after))) {
    throw new Error(`The ${identity.label} changed after verification.`);
  }
  if (openedIdentity.size !== identity.size || digest !== identity.sha256) {
    throw new Error(`The ${identity.label} size or SHA-256 is invalid: ${openedIdentity.size} bytes, ${digest}.`);
  }

  return Object.freeze({
    path: candidate,
    sha256: digest,
    size: openedIdentity.size,
    fileIdentity: openedIdentity,
  });
}

export async function verifyBundledDemo(candidate) {
  return verifyPinnedResource(
    candidate,
    BUNDLED_DEMO_RESOURCE_IDENTITIES[BUNDLED_DEMO_FILE_NAME],
  );
}

export async function verifyBundledDemoDocument(candidate, fileName) {
  const identity = BUNDLED_DEMO_RESOURCE_IDENTITIES[fileName];
  if (!identity || fileName === BUNDLED_DEMO_FILE_NAME) {
    throw new Error("The bundled demo document is not on the reviewed allowlist.");
  }
  return verifyPinnedResource(candidate, identity);
}

export async function verifyBundledDemoResourceSet(directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    throw new Error("The bundled demo resource-set directory must be absolute.");
  }
  const verified = {};
  for (const [fileName, identity] of Object.entries(BUNDLED_DEMO_RESOURCE_IDENTITIES)) {
    verified[fileName] = await verifyPinnedResource(path.join(directory, fileName), identity);
  }
  return Object.freeze(verified);
}
