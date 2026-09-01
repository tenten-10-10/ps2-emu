"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ps2", Object.freeze({
  getState: () => ipcRenderer.invoke("state:get"),
  acceptNotice: (payload) => ipcRenderer.invoke("notice:accept", payload),
  updatePreferences: (payload) => ipcRenderer.invoke("preferences:update", payload),
  addFiles: () => ipcRenderer.invoke("library:add-files"),
  addFolder: () => ipcRenderer.invoke("library:add-folder"),
  removeGame: (gameID) => ipcRenderer.invoke("library:remove", gameID),
  toggleFavorite: (gameID) => ipcRenderer.invoke("library:toggle-favorite", gameID),
  chooseModifiedCore: () => ipcRenderer.invoke("core:choose-modified"),
  useStandardCore: () => ipcRenderer.invoke("core:use-standard"),
  openOfficialPlayDownload: () => ipcRenderer.invoke("core:open-download"),
  launchGame: (gameID) => ipcRenderer.invoke("game:launch", gameID),
  openCoreSettings: () => ipcRenderer.invoke("core:settings"),
  stopCore: () => ipcRenderer.invoke("core:stop"),
  showLogs: () => ipcRenderer.invoke("logs:show"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("runtime:state", listener);
    return () => ipcRenderer.removeListener("runtime:state", listener);
  },
}));
