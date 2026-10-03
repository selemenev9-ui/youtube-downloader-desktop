const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  fetchFormats: (url) => ipcRenderer.invoke("media:probe", url),
  probeMedia: (url) => ipcRenderer.invoke("media:probe", url),
  createJob: (payload) => ipcRenderer.invoke("jobs:create", payload),
  cancelJob: (id) => ipcRenderer.invoke("jobs:cancel", id),
  onJobChange: (callback) => ipcRenderer.on("jobs:change", (_event, job) => callback(job)),
  startDownload: (url, format) =>
    ipcRenderer.send("download:start", { url, format }),
  onStatus: (callback) =>
    ipcRenderer.on("download:status", (_event, status) => callback(status)),
  onProgress: (callback) =>
    ipcRenderer.on("download:progress", (_event, percent) => callback(percent)),
  onDone: (callback) =>
    ipcRenderer.on("download:done", (_event, result) => callback(result)),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
