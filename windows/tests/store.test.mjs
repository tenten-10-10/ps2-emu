import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addGamePaths,
  defaultState,
  loadState,
  sanitizeState,
  saveState,
} from "../app/lib/store.mjs";

test("default state starts with consent and modified-core trust disabled", () => {
  assert.deepEqual(defaultState(), {
    schemaVersion: 1,
    preferences: {
      language: "system",
      consentAccepted: false,
      fullscreen: false,
      modifiedCorePath: null,
      allowModifiedCore: false,
      modifiedCoreConsentKey: null,
      standardCoreConsentKey: null,
      armCompatibilityConsentKey: null,
    },
    games: [],
  });
});

test("sanitizeState fail-closes malformed preferences and game records", () => {
  const sanitized = sanitizeState({
    schemaVersion: 99,
    preferences: {
      language: "remote-locale",
      consentAccepted: "yes",
      fullscreen: 1,
      modifiedCorePath: "relative\\Play.exe",
      allowModifiedCore: true,
    },
    games: [
      null,
      { filePath: "relative\\game.iso" },
      { filePath: "C:\\Games\\malware.exe" },
    ],
  });
  assert.deepEqual(sanitized, defaultState());
});

test("sanitizeState normalizes, deduplicates, bounds, and cleans persisted games", () => {
  const sanitized = sanitizeState({
    preferences: {
      language: "ja",
      consentAccepted: true,
      fullscreen: true,
      modifiedCorePath: "C:\\Tools\\Play.exe",
      allowModifiedCore: true,
      modifiedCoreConsentKey: "a".repeat(64),
      standardCoreConsentKey: "b".repeat(64),
    },
    games: [
      {
        id: "same-id",
        filePath: "C:\\Games\\Folder\\..\\Game.iso",
        title: " Title\u0000One ",
        favorite: true,
        addedAt: "2026-01-02T03:04:05Z",
        lastPlayedAt: "not-a-date",
        totalPlaySeconds: -7,
      },
      {
        id: "duplicate-path",
        filePath: "c:\\games\\GAME.ISO",
        title: "duplicate",
      },
      {
        id: "same-id",
        filePath: "D:\\Games\\Other.chd",
        title: "Other",
        totalPlaySeconds: Number.MAX_SAFE_INTEGER,
      },
    ],
  });

  assert.equal(sanitized.preferences.language, "ja");
  assert.equal(sanitized.preferences.consentAccepted, true);
  assert.equal(sanitized.preferences.fullscreen, true);
  assert.equal(sanitized.preferences.modifiedCorePath, "C:\\Tools\\Play.exe");
  assert.equal(sanitized.preferences.allowModifiedCore, true);
  assert.equal(sanitized.preferences.modifiedCoreConsentKey, "a".repeat(64));
  assert.equal(sanitized.preferences.standardCoreConsentKey, "b".repeat(64));
  assert.equal(sanitized.games.length, 2);
  assert.equal(sanitized.games[0].filePath, "C:\\Games\\Game.iso");
  assert.equal(sanitized.games[0].title, "Title One");
  assert.equal(sanitized.games[0].lastPlayedAt, null);
  assert.equal(sanitized.games[0].totalPlaySeconds, 0);
  assert.notEqual(sanitized.games[1].id, "same-id");
  assert.equal(sanitized.games[1].totalPlaySeconds, 100_000_000);
});

test("addGamePaths accepts only supported absolute paths and deduplicates case-insensitively", () => {
  const initial = addGamePaths(defaultState(), [
    "C:\\Games\\One.iso",
    "c:\\games\\ONE.ISO",
    "D:\\Homebrew\\Two.elf",
    "relative\\Three.chd",
    "C:\\Games\\Four.exe",
  ]);
  assert.equal(initial.games.length, 2);
  assert.deepEqual(initial.games.map((game) => game.title), ["One", "Two"]);
  assert.equal(initial.games.every((game) => /^[0-9a-f-]{36}$/i.test(game.id)), true);
});

test("saveState writes a normalized atomic file and requests private Unix permissions", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-store-test-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const statePath = path.join(temporaryDirectory, "nested", "library.json");
  const input = addGamePaths(defaultState(), ["C:\\Games\\Saved.iso"]);
  input.preferences.consentAccepted = true;

  const saved = await saveState(statePath, input);
  const loaded = await loadState(statePath);
  assert.deepEqual(loaded, saved);
  const permissionBits = (await fs.stat(statePath)).mode & 0o777;
  if (process.platform === "win32") {
    // Windows reports ACL-backed files with synthetic POSIX mode bits.
    assert.notEqual(permissionBits & 0o200, 0);
  } else {
    assert.equal(permissionBits, 0o600);
  }
  assert.equal((await fs.readFile(statePath, "utf8")).endsWith("\n"), true);
  assert.equal((await fs.readdir(path.dirname(statePath))).some((name) => name.includes(".tmp-")), false);
});

test("loadState preserves corrupt input before returning a safe default", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ps2-store-corrupt-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const statePath = path.join(temporaryDirectory, "library.json");
  await fs.writeFile(statePath, "{not valid json", { mode: 0o600 });

  assert.deepEqual(await loadState(statePath), defaultState());
  const entries = await fs.readdir(temporaryDirectory);
  assert.equal(entries.includes("library.json"), false);
  assert.equal(entries.filter((name) => name.startsWith("library.json.corrupt-")).length, 1);
});

test("loadState returns a safe default when the file does not exist", async () => {
  assert.deepEqual(await loadState(path.join(os.tmpdir(), `missing-${Date.now()}.json`)), defaultState());
});
