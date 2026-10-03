const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const path = require("path");
const { YtDlpService } = require("./src/main/services/YtDlpService");
const { JobManager } = require("./src/main/jobs/JobManager");
const { FfmpegService } = require("./src/main/services/FfmpegService");

const binPath = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(__dirname, "bin");
const downloader = new YtDlpService({
  executable: path.join(binPath, "yt-dlp.exe"),
  ffmpeg: path.join(binPath, "ffmpeg.exe"),
});
const mediaTools = new FfmpegService({
  ffmpeg: path.join(binPath, "ffmpeg.exe"),
  ffprobe: path.join(binPath, "ffprobe.exe"),
});
let jobs;

function createWindow() {
  const { width: workWidth, height: workHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.max(880, Math.min(1120, Math.floor(workWidth * 0.72))),
    height: Math.max(520, Math.min(640, Math.floor(workHeight * 0.74))),
    minWidth: 860,
    minHeight: 500,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    backgroundColor: "#080914",
    autoHideMenuBar: true,
    title: "VantaFetch",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "dist-ui", "index.html"));
  win.once("ready-to-show", () => {
    win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    win.center();
    win.show();
  });
}

function registerIpc() {
  ipcMain.handle("media:probe", async (_event, url) => {
    try {
      return await downloader.probe(url);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("jobs:create", (_event, payload) =>
    jobs.create({ url: payload.url, format: payload.format }),
  );
  ipcMain.handle("jobs:cancel", (_event, id) => jobs.cancel(id));
  ipcMain.handle("tools:pick-media", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Media files",
          extensions: [
            "mp4",
            "mkv",
            "mov",
            "webm",
            "avi",
            "m4v",
            "mp3",
            "m4a",
            "aac",
            "flac",
            "wav",
            "ogg",
          ],
        },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return mediaTools.inspect(result.filePaths[0]);
  });
  ipcMain.handle("tools:pick-watermark", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Watermark image", extensions: ["png", "webp"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return {
      path: result.filePaths[0],
      name: path.basename(result.filePaths[0]),
    };
  });
  ipcMain.handle("tools:compress", async (event, payload) => {
    try {
      const result = await mediaTools.compressToSize({
        inputPath: payload.path,
        targetMb: payload.targetMb,
        outputDir: app.getPath("downloads"),
        onProgress: (progress) => event.sender.send("tools:progress", progress),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("tools:extract-audio", async (event, payload) => {
    try {
      const result = await mediaTools.extractAudio({
        inputPath: payload.path,
        format: payload.format,
        outputDir: app.getPath("downloads"),
        onProgress: (progress) => event.sender.send("tools:progress", progress),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("tools:create-animation", async (event, payload) => {
    try {
      const result = await mediaTools.createAnimation({
        inputPath: payload.path,
        format: payload.format,
        start: payload.start,
        duration: payload.duration,
        outputDir: app.getPath("downloads"),
        onProgress: (progress) => event.sender.send("tools:progress", progress),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("tools:watermark", async (event, payload) => {
    try {
      const result = await mediaTools.applyWatermark({
        inputPath: payload.path,
        watermarkPath: payload.watermarkPath,
        position: payload.position,
        scale: payload.scale,
        opacity: payload.opacity,
        outputDir: app.getPath("downloads"),
        onProgress: (progress) => event.sender.send("tools:progress", progress),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.on("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  ipcMain.on("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  );

  // Compatibility events for the v1 React screen while the v2 queue UI is introduced.
  ipcMain.on("download:start", (event, payload) => {
    try {
      jobs.create({ url: payload.url, format: payload.format });
    } catch (error) {
      event.sender.send("download:done", {
        success: false,
        error: error.message,
      });
    }
  });
  jobs.on("change", (job) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("jobs:change", job);
      if (job.state === "downloading" && job.progress === 0)
        win.webContents.send("download:status", "Downloading...");
      if (job.state === "downloading" && job.progress > 0)
        win.webContents.send("download:progress", {
          percent: job.progress,
          eta: job.eta,
        });
      if (["completed", "failed", "cancelled"].includes(job.state))
        win.webContents.send("download:done", {
          success: job.state === "completed",
          filePath: job.outputPath,
          error: job.error || (job.state === "cancelled" ? "Cancelled" : null),
        });
    }
  });
}

app.whenReady().then(() => {
  jobs = new JobManager({ downloader, outputDir: app.getPath("downloads") });
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
