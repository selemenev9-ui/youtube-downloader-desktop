const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  fetchFormats: (url) => ipcRenderer.invoke("formats:fetch", url),
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
