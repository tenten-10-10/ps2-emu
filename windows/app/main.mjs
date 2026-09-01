import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  BUNDLED_DEMO_DIRECTORY_NAME,
  BUNDLED_DEMO_FILE_NAME,
  BUNDLED_DEMO_ID,
  BUNDLED_DEMO_SHA256,
  BUNDLED_DEMO_TERMS_REVISION,
  BUNDLED_DEMO_TITLE,
  bundledDemoPath,
  verifyBundledDemo,
  verifyBundledDemoDocument,
  verifyBundledDemoResourceSet,
} from "./lib/bundled-demo.mjs";
import {
  parseOfficialCoreIdentityManifest,
  verifyOfficialCoreIdentity,
} from "./lib/core-identity.mjs";
import {
  OFFICIAL_PLAY_DOWNLOAD_URL,
  SUPPORTED_EXTENSIONS,
  assertCoreExecutableIdentity,
  canRunX64PlayCore,
  commandArguments,
  isAllowedExternalURL,
  isSupportedWindowsGamePath,
  modifiedCoreConsentKey,
  standardCorePath,
  validateWindowsCore,
} from "./lib/core.mjs";
import {
  addGamePaths,
  defaultState,
  loadState,
  reconcileBundledDemo,
  removeGameByID,
  saveState,
} from "./lib/store.mjs";
import { collectWindowsCoreEvidence } from "./lib/windows-core-evidence.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const captureArgument = process.argv.find((argument) => argument.startsWith("--capture-preview="));
const capturePath = captureArgument
  ? path.resolve(process.cwd(), captureArgument.slice("--capture-preview=".length))
  : null;
const isPreviewCapture = capturePath !== null && !app.isPackaged;
const identityManifestPath = path.join(moduleDirectory, "core-identity-manifest.json");
const legacyUserDataDirectoryName = "PS2 Emulator";
if (process.platform === "win32" && !isPreviewCapture) {
  // Product renaming must not orphan the existing PS2 Emulator library.json.
  app.setPath("userData", path.join(app.getPath("appData"), legacyUserDataDirectoryName));
}
const maximumScanEntries = 50_000;
const maximumScanDepth = 24;
const maximumLogBytes = 10 * 1024 * 1024;
const maximumLogCount = 20;
const bundledDemoDocuments = Object.freeze({
  license: "PS2SDK-AFL-2.0.txt",
  notice: "PS2SDK-CUBE-NOTICE.md",
});

let mainWindow = null;
let state = defaultState();
let stateFile = null;
let bundledDemoFilePath = null;
let ownedCoreProcess = null;
let ownedProcessStartedAt = null;
let ownedGameID = null;
let pendingApplicationQuit = false;
let officialCoreIdentityManifest = null;
let runtime = {
  status: "idle",
  currentGameTitle: null,
  error: null,
  logPath: null,
};

function previewState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    preferences: {
      language: "en",
      consentAccepted: true,
      fullscreen: false,
      modifiedCorePath: null,
      allowModifiedCore: false,
      modifiedCoreConsentKey: null,
      standardCoreConsentKey: null,
      armCompatibilityConsentKey: null,
      bundledDemoDismissed: false,
      bundledDemoTermsAccepted: true,
      bundledDemoTermsRevision: BUNDLED_DEMO_TERMS_REVISION,
    },
    games: [
      {
        id: "preview-1",
        filePath: "C:\\Games\\Aurora Circuit.iso",
        title: "Aurora Circuit",
        favorite: true,
        addedAt: now,
        lastPlayedAt: now,
        totalPlaySeconds: 7_620,
      },
      {
        id: "preview-2",
        filePath: "C:\\Games\\Crimson Vector.chd",
        title: "Crimson Vector",
        favorite: false,
        addedAt: now,
        lastPlayedAt: null,
        totalPlaySeconds: 0,
      },
      {
        id: BUNDLED_DEMO_ID,
        filePath: `C:\\Program Files\\PS2 Emu\\resources\\${BUNDLED_DEMO_DIRECTORY_NAME}\\${BUNDLED_DEMO_FILE_NAME}`,
        title: BUNDLED_DEMO_TITLE,
        favorite: false,
        addedAt: now,
        lastPlayedAt: null,
        totalPlaySeconds: 0,
      },
    ],
  };
}

function configuredBundledDemoPath() {
  if (app.isPackaged) return bundledDemoPath(process.resourcesPath);
  return path.resolve(moduleDirectory, "..", "..", "Resources", "Fixtures", "ps2sdk-cube.elf");
}

function resolvedLanguage() {
  if (state.preferences.language === "en" || state.preferences.language === "ja") {
    return state.preferences.language;
  }
  return app.getLocale().toLowerCase().startsWith("ja") ? "ja" : "en";
}

function requireConsent() {
  if (
    state.preferences.consentAccepted !== true
    || state.preferences.bundledDemoTermsAccepted !== true
    || state.preferences.bundledDemoTermsRevision !== BUNDLED_DEMO_TERMS_REVISION
  ) {
    throw new Error("Accept the first-run safety and bundled-demo license notice before using the library, core, links, or launch actions.");
  }
}

function trustedWindowsCorePaths() {
  if (process.platform !== "win32") return { environment: process.env, systemDirectory: null };
  const systemDirectory = app.getPath("system");
  const systemDriveRoot = path.win32.parse(systemDirectory).root;
  if (!systemDriveRoot || !path.win32.isAbsolute(systemDirectory)) {
    throw new Error("Windows system directory could not be resolved through Electron.");
  }
  const programFiles = path.win32.join(systemDriveRoot, "Program Files");
  return {
    systemDirectory,
    environment: { ProgramW6432: programFiles, ProgramFiles: programFiles },
  };
}

function runtimeStandardCorePath() {
  return standardCorePath(trustedWindowsCorePaths().environment);
}

async function validateSelectedCore(candidate, usingModified) {
  const validated = await validateWindowsCore(candidate, {
    mode: usingModified ? "modified" : "official",
    environment: trustedWindowsCorePaths().environment,
  });
  if (usingModified) {
    if (state.preferences.modifiedCoreConsentKey !== modifiedCoreConsentKey(validated)) {
      throw new Error("The custom Play.exe changed or no longer matches the approved path and SHA-256. Select it again to review and approve the exact file.");
    }
    return validated;
  }
  if (!officialCoreIdentityManifest) {
    throw new Error("The bundled standard-core identity manifest is unavailable or invalid.");
  }
  const trustedPaths = trustedWindowsCorePaths();
  const evidence = await collectWindowsCoreEvidence(validated.path, trustedPaths);
  const identity = verifyOfficialCoreIdentity(evidence, officialCoreIdentityManifest);
  return Object.freeze({ ...validated, identity });
}

async function coreSummary() {
  if (isPreviewCapture) {
    return {
      available: false,
      mode: "official",
      path: "%ProgramFiles%\\Play\\Play.exe",
      machine: "x64",
      sha256: null,
      message: "Install official Play! x64 to launch games.",
      arm64CoreIsEmulated: process.arch === "arm64",
      verificationMode: "hash-only",
      publisherVerified: false,
    };
  }
  const usingModified = state.preferences.allowModifiedCore && state.preferences.modifiedCorePath;
  const candidate = usingModified ? state.preferences.modifiedCorePath : runtimeStandardCorePath();
  if (!candidate) {
    return {
      available: false,
      mode: usingModified ? "modified" : "official",
      path: null,
      machine: null,
      sha256: null,
      message: "Official Play! x64 was not found in Program Files.",
      arm64CoreIsEmulated: process.arch === "arm64",
    };
  }
  try {
    const validated = await validateSelectedCore(candidate, usingModified);
    return {
      available: true,
      ...validated,
      message: usingModified
        ? "Custom x64 Play! core selected. Publisher identity is not verified."
        : `${validated.identity.warning} Exact identity: ${validated.identity.releaseID}.`,
      arm64CoreIsEmulated: process.arch === "arm64",
      verificationMode: usingModified ? "custom-unverified" : validated.identity.verificationMode,
      publisherVerified: usingModified ? false : validated.identity.publisherVerified,
    };
  } catch (error) {
    return {
      available: false,
      mode: usingModified ? "modified" : "official",
      path: candidate,
      machine: null,
      sha256: null,
      message: error.message,
      arm64CoreIsEmulated: process.arch === "arm64",
      verificationMode: usingModified ? "custom-unverified" : "hash-only",
      publisherVerified: false,
    };
  }
}

async function rendererState() {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    language: resolvedLanguage(),
    preferences: { ...state.preferences },
    games: state.games.map((game) => ({ ...game })),
    core: await coreSummary(),
    runtime: { ...runtime },
    officialPlayURL: OFFICIAL_PLAY_DOWNLOAD_URL,
    bundledDemo: {
      id: BUNDLED_DEMO_ID,
      title: BUNDLED_DEMO_TITLE,
      sha256: BUNDLED_DEMO_SHA256,
      license: "Academic Free License 2.0 (AFL-2.0)",
      officialSource: "ps2dev/ps2sdk samples/cube",
      commercialGamesIncluded: false,
    },
    osRelease: os.release(),
  };
}

async function emitState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("runtime:state", await rendererState());
}

async function persistAndEmit() {
  if (!isPreviewCapture) state = await saveState(stateFile, state);
  await emitState();
}

async function regularSupportedFile(filePath) {
  if (!isSupportedWindowsGamePath(filePath)) return false;
  try {
    const stat = await fs.lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function scanFolder(root) {
  const found = [];
  const queue = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < maximumScanEntries) {
    const { directory, depth } = queue.shift();
    let handle;
    try {
      handle = await fs.opendir(directory);
      for await (const entry of handle) {
        visited += 1;
        if (visited >= maximumScanEntries) break;
        const candidate = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && depth < maximumScanDepth) {
          queue.push({ directory: candidate, depth: depth + 1 });
        } else if (entry.isFile() && isSupportedWindowsGamePath(candidate)) {
          found.push(candidate);
        }
      }
    } catch {
      // Permission and transient filesystem errors skip only that directory.
      try { await handle?.close(); } catch { /* already closed */ }
    }
  }
  return found;
}

function safeLogStem(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "game";
}

async function createLogWriter(title) {
  // Preserve the established on-disk log directory across the product rename.
  const logDirectory = path.join(app.getPath("logs"), "PS2 Emulator");
  await fs.mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const entries = await fs.readdir(logDirectory, { withFileTypes: true }).catch(() => []);
  const logs = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || path.extname(entry.name).toLowerCase() !== ".log") continue;
    const filePath = path.join(logDirectory, entry.name);
    try {
      const stat = await fs.lstat(filePath);
      if (stat.isFile() && !stat.isSymbolicLink()) logs.push({ filePath, modified: stat.mtimeMs });
    } catch { /* skip raced entries */ }
  }
  logs.sort((left, right) => right.modified - left.modified);
  for (const entry of logs.slice(maximumLogCount - 1)) {
    await fs.rm(entry.filePath, { force: true }).catch(() => {});
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDirectory, `${stamp}-${safeLogStem(title)}.log`);
  const stream = createWriteStream(logPath, { flags: "wx", mode: 0o600 });
  let bytesWritten = 0;
  let truncated = false;
  const append = (chunk) => {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (truncated) return;
    const remaining = maximumLogBytes - bytesWritten;
    if (remaining <= 0) {
      stream.write("\n[PS2 Emu: log truncated at 10 MiB]\n");
      truncated = true;
      return;
    }
    const payload = data.subarray(0, remaining);
    stream.write(payload);
    bytesWritten += payload.length;
    if (payload.length < data.length) {
      stream.write("\n[PS2 Emu: log truncated at 10 MiB]\n");
      truncated = true;
    }
  };
  return { logPath, append, close: () => stream.end() };
}

async function validatedSelectedGame(gameID) {
  const game = state.games.find((candidate) => candidate.id === gameID);
  if (!game) throw new Error("The selected game is not in the saved library.");
  if (game.id === BUNDLED_DEMO_ID) {
    if (!bundledDemoFilePath) throw new Error("The bundled PS2SDK Cube Demo is unavailable.");
    const verified = await verifyBundledDemo(bundledDemoFilePath);
    return {
      ...game,
      id: BUNDLED_DEMO_ID,
      title: BUNDLED_DEMO_TITLE,
      filePath: verified.path,
    };
  }
  if (!(await regularSupportedFile(game.filePath))) {
    throw new Error("The selected game file is missing, unsupported, or not a regular file.");
  }
  return game;
}

async function resolveValidatedCore() {
  if (!canRunX64PlayCore({
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
  })) {
    if (process.platform === "win32" && process.arch === "arm64") {
      throw new Error("The x64 Play! compatibility core requires Windows 11 build 22000 or newer on ARM64.");
    }
    throw new Error("This Windows build supports only x64 Windows or ARM64 Windows 11 hosts.");
  }
  const usingModified = state.preferences.allowModifiedCore && state.preferences.modifiedCorePath;
  const candidate = usingModified ? state.preferences.modifiedCorePath : runtimeStandardCorePath();
  if (!candidate) throw new Error("Install official Play! x64 or explicitly select a custom Play.exe.");
  return validateSelectedCore(candidate, usingModified);
}

async function confirmHashOnlyStandardCore(core) {
  if (core.mode !== "official") return;
  if (
    core.identity.verificationMode !== "hash-only"
    || core.identity.publisherVerified !== false
    || core.identity.userConsentRequired !== true
  ) return;
  if (state.preferences.standardCoreConsentKey === core.identity.identityKey) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Unsigned Play! · hash-only verification",
    message: "This Play! build is unsigned. Its publisher cannot be verified.",
    detail: `PS2 Emu matched every approved x64 Play!/Qt file by exact SHA-256 and size, plus Play.exe version signals, for upstream commit ${core.identity.upstreamCommit}. This proves byte identity with the reviewed build, not who published those bytes. You will be asked again if the approved identity changes.\n\n${core.identity.warning}`,
    buttons: ["Cancel", "I understand · run this exact build"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response !== 1) throw new Error("Unsigned hash-only Play! launch was canceled.");
  state.preferences.standardCoreConsentKey = core.identity.identityKey;
  if (!isPreviewCapture) state = await saveState(stateFile, state);
}

async function confirmArmCompatibility(core) {
  if (process.platform !== "win32" || process.arch !== "arm64") return;
  const consentKey = `${core.sha256}|${os.release()}`;
  if (state.preferences.armCompatibilityConsentKey === consentKey) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "x64 Play! compatibility core",
    message: "This launcher is ARM64-native, but the selected Play! core is x64.",
    detail: "Windows 11 will run Play! through its x64 compatibility layer. This is not an ARM64-native PS2 core. Performance, battery use, stability and game compatibility can differ from x64 Windows. Continue only if you understand this limitation.",
    buttons: ["Cancel", "Continue with x64 Play!"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response !== 1) throw new Error("ARM64/x64 compatibility launch was canceled.");
  state.preferences.armCompatibilityConsentKey = consentKey;
  if (!isPreviewCapture) state = await saveState(stateFile, state);
}

async function launchCore({ game = null, settingsOnly = false } = {}) {
  requireConsent();
  if (ownedCoreProcess) throw new Error("Another Play! process launched by this app is still running.");
  let core = await resolveValidatedCore();
  await confirmHashOnlyStandardCore(core);
  await confirmArmCompatibility(core);
  let selectedGame = game ? await validatedSelectedGame(game.id) : null;
  const title = settingsOnly ? "Play Settings" : selectedGame.title;
  const { spawn } = await import("node:child_process");
  const log = await createLogWriter(title);
  try {
    const revalidatedCore = await resolveValidatedCore();
    const firstIdentity = core.mode === "official" ? core.identity.identityKey : modifiedCoreConsentKey(core);
    const secondIdentity = revalidatedCore.mode === "official"
      ? revalidatedCore.identity.identityKey
      : modifiedCoreConsentKey(revalidatedCore);
    if (firstIdentity !== secondIdentity) {
      throw new Error("Play! identity changed before launch. Launch was blocked; review the core again.");
    }
    core = revalidatedCore;
    await assertCoreExecutableIdentity(core);
    if (selectedGame) selectedGame = await validatedSelectedGame(selectedGame.id);
  } catch (error) {
    log.close();
    throw error;
  }
  const args = settingsOnly ? [] : commandArguments(selectedGame.filePath, state.preferences.fullscreen);
  const child = spawn(core.path, args, {
    shell: false,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"],
    cwd: path.dirname(core.path),
  });
  ownedCoreProcess = child;
  ownedProcessStartedAt = Date.now();
  ownedGameID = selectedGame?.id || null;
  runtime = {
    status: "launching",
    currentGameTitle: title,
    error: null,
    logPath: log.logPath,
  };
  child.stdout.on("data", log.append);
  child.stderr.on("data", log.append);
  child.once("spawn", async () => {
    runtime.status = "running";
    await emitState();
  });
  child.once("error", async (error) => {
    runtime.status = "failed";
    runtime.error = error.message;
    log.append(`\nLaunch error: ${error.message}\n`);
    log.close();
    ownedCoreProcess = null;
    await emitState();
  });
  child.once("close", async (code) => {
    const elapsedSeconds = ownedProcessStartedAt ? Math.max(0, Math.round((Date.now() - ownedProcessStartedAt) / 1000)) : 0;
    log.close();
    if (ownedGameID) {
      const played = state.games.find((candidate) => candidate.id === ownedGameID);
      if (played) {
        played.lastPlayedAt = new Date().toISOString();
        played.totalPlaySeconds += elapsedSeconds;
      }
    }
    ownedCoreProcess = null;
    ownedProcessStartedAt = null;
    ownedGameID = null;
    runtime = {
      status: "idle",
      currentGameTitle: null,
      error: code === 0 || code === null ? null : `Play! exited with code ${code}.`,
      logPath: log.logPath,
    };
    await persistAndEmit();
    if (pendingApplicationQuit) {
      pendingApplicationQuit = false;
      app.quit();
    }
  });
  await emitState();
}

function stopOwnedCore() {
  if (!ownedCoreProcess) return;
  const processToStop = ownedCoreProcess;
  runtime.status = "stopping";
  void emitState();
  processToStop.kill();
  setTimeout(() => {
    if (ownedCoreProcess !== processToStop) return;
    runtime.status = "waiting";
    runtime.error = "Play! did not close automatically. Save in the game, then close the Play! window.";
    void emitState();
  }, 4_000).unref();
}

async function openBundledDemoDocument(kind) {
  const filename = bundledDemoDocuments[kind];
  if (!filename || !bundledDemoFilePath) throw new Error("The bundled demo document is unavailable.");
  const candidate = path.join(path.dirname(bundledDemoFilePath), filename);
  await verifyBundledDemoDocument(candidate, filename);
  const openError = await shell.openPath(candidate);
  if (openError) throw new Error(`Windows could not open the bundled demo document: ${openError}`);
  return true;
}

function registerIPC() {
  ipcMain.handle("state:get", () => rendererState());

  ipcMain.handle("notice:accept", async (_event, payload) => {
    if (
      payload?.lawfulUseAccepted !== true
      || payload?.privacyAccepted !== true
      || payload?.nonAffiliationAccepted !== true
      || payload?.hashOnlyRiskAccepted !== true
      || payload?.bundledDemoAccepted !== true
      || !["en", "ja"].includes(payload?.language)
    ) throw new Error("All first-run safety acknowledgements are required.");
    state.preferences.consentAccepted = true;
    state.preferences.bundledDemoTermsAccepted = true;
    state.preferences.bundledDemoTermsRevision = BUNDLED_DEMO_TERMS_REVISION;
    state.preferences.language = payload.language;
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("preferences:update", async (_event, payload) => {
    requireConsent();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid preferences.");
    if (Object.hasOwn(payload, "language")) {
      if (!["system", "en", "ja"].includes(payload.language)) throw new Error("Invalid language.");
      state.preferences.language = payload.language;
    }
    if (Object.hasOwn(payload, "fullscreen")) state.preferences.fullscreen = payload.fullscreen === true;
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("library:add-files", async () => {
    requireConsent();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Add legally owned game images or homebrew",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Supported games", extensions: SUPPORTED_EXTENSIONS.map((value) => value.slice(1)) }],
    });
    if (result.canceled) return rendererState();
    const accepted = [];
    for (const filePath of result.filePaths) {
      if (await regularSupportedFile(filePath)) accepted.push(filePath);
    }
    state = addGamePaths(state, accepted);
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("library:add-folder", async () => {
    requireConsent();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Scan a game folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return rendererState();
    state = addGamePaths(state, await scanFolder(result.filePaths[0]));
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("library:remove", async (_event, gameID) => {
    requireConsent();
    state = removeGameByID(state, gameID);
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("library:toggle-favorite", async (_event, gameID) => {
    requireConsent();
    const game = state.games.find((candidate) => candidate.id === gameID);
    if (!game) throw new Error("Game not found.");
    game.favorite = !game.favorite;
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("core:choose-modified", async () => {
    requireConsent();
    const warning = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Custom Play! core",
      message: "A custom executable is not publisher or version verified.",
      detail: "Choose a custom Play.exe only if you understand and trust it. Consent binds only that Play.exe path and SHA-256; adjacent DLLs and plugins are not identity-pinned. It will not be described as an official verified core.",
      buttons: ["Cancel", "Choose custom Play.exe"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (warning.response !== 1) return rendererState();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a custom x64 Play.exe",
      properties: ["openFile"],
      filters: [{ name: "Play! executable", extensions: ["exe"] }],
    });
    if (result.canceled || !result.filePaths[0]) return rendererState();
    const validated = await validateWindowsCore(result.filePaths[0], { mode: "modified" });
    const exactFileWarning = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Approve this exact custom Play.exe",
      message: "Trust this exact path and SHA-256 for local execution?",
      detail: `${validated.path}\nSHA-256: ${validated.sha256}\n\nIf the file or path changes, PS2 Emu will block launch and require approval again. Publisher, version, and adjacent dependencies are still unverified.`,
      buttons: ["Cancel", "Trust this exact file"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (exactFileWarning.response !== 1) return rendererState();
    state.preferences.modifiedCorePath = validated.path;
    state.preferences.allowModifiedCore = true;
    state.preferences.modifiedCoreConsentKey = modifiedCoreConsentKey(validated);
    state.preferences.armCompatibilityConsentKey = null;
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("core:use-standard", async () => {
    requireConsent();
    state.preferences.modifiedCorePath = null;
    state.preferences.allowModifiedCore = false;
    state.preferences.modifiedCoreConsentKey = null;
    state.preferences.armCompatibilityConsentKey = null;
    await persistAndEmit();
    return rendererState();
  });

  ipcMain.handle("core:open-download", async () => {
    requireConsent();
    if (!isAllowedExternalURL(OFFICIAL_PLAY_DOWNLOAD_URL)) throw new Error("Official download URL rejected.");
    await shell.openExternal(OFFICIAL_PLAY_DOWNLOAD_URL);
    return true;
  });

  ipcMain.handle("game:launch", async (_event, gameID) => {
    await launchCore({ game: { id: gameID } });
    return true;
  });
  ipcMain.handle("core:settings", async () => {
    await launchCore({ settingsOnly: true });
    return true;
  });
  ipcMain.handle("core:stop", () => {
    requireConsent();
    stopOwnedCore();
    return true;
  });
  ipcMain.handle("logs:show", async () => {
    requireConsent();
    const logDirectory = path.join(app.getPath("logs"), "PS2 Emulator");
    await fs.mkdir(logDirectory, { recursive: true, mode: 0o700 });
    await shell.openPath(logDirectory);
    return true;
  });
  ipcMain.handle("demo:open-license", () => {
    return openBundledDemoDocument("license");
  });
  ipcMain.handle("demo:open-notice", () => {
    return openBundledDemoDocument("notice");
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 760,
    minHeight: 620,
    show: !isPreviewCapture,
    backgroundColor: "#080914",
    title: "PS2 Emu",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(moduleDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (target !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  await mainWindow.loadFile(path.join(moduleDirectory, "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (!ownedCoreProcess || pendingApplicationQuit) return;
    event.preventDefault();
    pendingApplicationQuit = true;
    stopOwnedCore();
  });

  if (isPreviewCapture) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const image = await mainWindow.webContents.capturePage();
    await fs.mkdir(path.dirname(capturePath), { recursive: true });
    await fs.writeFile(capturePath, image.toPNG(), { mode: 0o600 });
    app.quit();
  }
}

app.whenReady().then(async () => {
  const manifestValue = JSON.parse(await fs.readFile(identityManifestPath, "utf8"));
  parseOfficialCoreIdentityManifest(manifestValue);
  officialCoreIdentityManifest = manifestValue;
  stateFile = path.join(app.getPath("userData"), "library.json");
  if (isPreviewCapture) {
    state = previewState();
  } else {
    const configuredDemoPath = configuredBundledDemoPath();
    await verifyBundledDemoResourceSet(path.dirname(configuredDemoPath));
    bundledDemoFilePath = (await verifyBundledDemo(configuredDemoPath)).path;
    state = reconcileBundledDemo(await loadState(stateFile), bundledDemoFilePath);
    state = await saveState(stateFile, state);
  }
  registerIPC();
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("before-quit", (event) => {
  if (!ownedCoreProcess || pendingApplicationQuit) return;
  event.preventDefault();
  pendingApplicationQuit = true;
  stopOwnedCore();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !ownedCoreProcess) app.quit();
});
