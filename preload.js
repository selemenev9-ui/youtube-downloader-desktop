const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  fetchFormats: (url) => ipcRenderer.invoke("media:probe", url),
  probeMedia: (url) => ipcRenderer.invoke("media:probe", url),
  createJob: (payload) => ipcRenderer.invoke("jobs:create", payload),
  cancelJob: (id) => ipcRenderer.invoke("jobs:cancel", id),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  restartForUpdate: () => ipcRenderer.invoke("updates:restart"),
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("updates:progress", listener);
    return () => ipcRenderer.removeListener("updates:progress", listener);
  },
  openUpdate: (url) => ipcRenderer.invoke("updates:open", url),
  onEngineStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("engine:status", listener);
    return () => ipcRenderer.removeListener("engine:status", listener);
  },
  pickMedia: () => ipcRenderer.invoke("tools:pick-media"),
  pickWatermark: () => ipcRenderer.invoke("tools:pick-watermark"),
  compressMedia: (payload) => ipcRenderer.invoke("tools:compress", payload),
  extractAudio: (payload) => ipcRenderer.invoke("tools:extract-audio", payload),
  createAnimation: (payload) =>
    ipcRenderer.invoke("tools:create-animation", payload),
  applyWatermark: (payload) => ipcRenderer.invoke("tools:watermark", payload),
  onToolProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("tools:progress", listener);
    return () => ipcRenderer.removeListener("tools:progress", listener);
  },
  onJobChange: (callback) =>
    ipcRenderer.on("jobs:change", (_event, job) => callback(job)),
  startDownload: (url, format, liveDuration) =>
    ipcRenderer.send("download:start", { url, format, liveDuration }),
  onStatus: (callback) =>
    ipcRenderer.on("download:status", (_event, status) => callback(status)),
  onProgress: (callback) =>
    ipcRenderer.on("download:progress", (_event, percent) => callback(percent)),
  onDone: (callback) =>
    ipcRenderer.on("download:done", (_event, result) => callback(result)),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
