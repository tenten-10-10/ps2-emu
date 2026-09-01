import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { displayTitle, isSupportedWindowsGamePath } from "./core.mjs";

const MAX_GAMES = 10_000;

export function defaultState() {
  return {
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
  };
}

function safeString(value, maximumLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, maximumLength) : null;
}

function safeDate(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function safeGame(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!isSupportedWindowsGamePath(value.filePath)) return null;
  return {
    id: safeString(value.id, 80) || crypto.randomUUID(),
    filePath: path.win32.normalize(value.filePath),
    title: safeString(value.title, 180) || displayTitle(value.filePath),
    favorite: value.favorite === true,
    addedAt: safeDate(value.addedAt) || new Date().toISOString(),
    lastPlayedAt: safeDate(value.lastPlayedAt),
    totalPlaySeconds: Number.isFinite(value.totalPlaySeconds)
      ? Math.max(0, Math.min(100_000_000, Math.floor(value.totalPlaySeconds)))
      : 0,
  };
}

export function sanitizeState(value) {
  const state = defaultState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return state;

  const preferences = value.preferences;
  if (preferences && typeof preferences === "object" && !Array.isArray(preferences)) {
    state.preferences.language = ["system", "en", "ja"].includes(preferences.language)
      ? preferences.language
      : "system";
    state.preferences.consentAccepted = preferences.consentAccepted === true;
    state.preferences.fullscreen = preferences.fullscreen === true;
    const corePath = safeString(preferences.modifiedCorePath, 32_767);
    state.preferences.modifiedCorePath = corePath && path.win32.isAbsolute(corePath)
      ? path.win32.normalize(corePath)
      : null;
    const modifiedCoreConsentKey = safeString(preferences.modifiedCoreConsentKey, 64);
    state.preferences.modifiedCoreConsentKey = modifiedCoreConsentKey
      && /^[0-9a-f]{64}$/.test(modifiedCoreConsentKey)
      ? modifiedCoreConsentKey
      : null;
    state.preferences.allowModifiedCore = preferences.allowModifiedCore === true
      && state.preferences.modifiedCorePath !== null
      && state.preferences.modifiedCoreConsentKey !== null;
    const standardCoreConsentKey = safeString(preferences.standardCoreConsentKey, 64);
    state.preferences.standardCoreConsentKey = standardCoreConsentKey
      && /^[0-9a-f]{64}$/.test(standardCoreConsentKey)
      ? standardCoreConsentKey
      : null;
    state.preferences.armCompatibilityConsentKey = safeString(
      preferences.armCompatibilityConsentKey,
      200,
    );
  }

  const seenPaths = new Set();
  const seenIDs = new Set();
  for (const candidate of Array.isArray(value.games) ? value.games.slice(0, MAX_GAMES) : []) {
    const game = safeGame(candidate);
    if (!game) continue;
    const pathKey = game.filePath.toLocaleLowerCase("en-US");
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    if (seenIDs.has(game.id)) game.id = crypto.randomUUID();
    seenIDs.add(game.id);
    state.games.push(game);
  }

  return state;
}

export function addGamePaths(state, filePaths) {
  const next = sanitizeState(state);
  const seen = new Set(next.games.map((game) => game.filePath.toLocaleLowerCase("en-US")));
  for (const filePath of filePaths) {
    if (next.games.length >= MAX_GAMES || !isSupportedWindowsGamePath(filePath)) continue;
    const normalized = path.win32.normalize(filePath);
    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    next.games.push({
      id: crypto.randomUUID(),
      filePath: normalized,
      title: displayTitle(normalized),
      favorite: false,
      addedAt: new Date().toISOString(),
      lastPlayedAt: null,
      totalPlaySeconds: 0,
    });
  }
  return next;
}

export async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") return defaultState();
    const preserved = `${filePath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(filePath, preserved);
    } catch {
      // Preserve failure is non-fatal; the caller still receives a safe state.
    }
    return defaultState();
  }
}

export async function saveState(filePath, state) {
  const clean = sanitizeState(state);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const payload = `${JSON.stringify(clean, null, 2)}\n`;
  await fs.writeFile(temporary, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return clean;
}
