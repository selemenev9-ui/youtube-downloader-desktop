const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const binPath = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(__dirname, "bin");

const ytDlpPath = path.join(binPath, "yt-dlp.exe");
const ffmpegPath = path.join(binPath, "ffmpeg.exe");

function createWindow() {
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.max(920, Math.min(1240, Math.floor(workWidth * 0.86)));
  const windowHeight = Math.max(620, Math.min(800, Math.floor(workHeight * 0.86)));
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    backgroundColor: "#080914",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
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

function buildArgs(url, format, downloadsDir) {
  const outputTemplate = path.join(downloadsDir, "%(title)s.%(ext)s");
  const args = [
    "--ffmpeg-location",
    ffmpegPath,
    "--newline",
    "--no-playlist",
    "-o",
    outputTemplate,
  ];

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    const height = parseInt(format, 10);
    args.push(
      "-f",
      `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
      "--merge-output-format",
      "mp4"
    );
  }

  args.push(url);
  return args;
}

const QUALITY_TIERS = [2160, 1440, 1080, 720];
const TIER_LABELS = {
  2160: "2160p (4K)",
  1440: "1440p (2K)",
  1080: "1080p (Full HD)",
  720: "720p (HD)",
};

ipcMain.handle("formats:fetch", (_event, url) => {
  return new Promise((resolve) => {
    const proc = spawn(
      ytDlpPath,
      ["--dump-json", "--no-playlist", "--skip-download", url],
      { windowsHide: true }
    );

    let out = "";
    let err = "";

    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        const errLine = err
          .split(/\r?\n/)
          .filter((l) => /error/i.test(l))
          .pop();
        return resolve({
          ok: false,
          error: errLine || `yt-dlp exited with code ${code}`,
        });
      }

      try {
        const info = JSON.parse(out);
        const heights = (info.formats || [])
          .filter((f) => f.vcodec && f.vcodec !== "none" && f.height)
          .map((f) => f.height);

        const maxHeight = heights.length ? Math.max(...heights) : 0;
        const formats = QUALITY_TIERS
          .filter((tier) => maxHeight >= tier)
          .map((t) => ({ id: String(t), label: TIER_LABELS[t] }));

        formats.push({ id: "audio", label: "Audio Only (MP3)" });
        resolve({
          ok: true,
          formats,
          meta: {
            title: info.title || "Unknown title",
            thumbnail: info.thumbnail || null,
            uploader: info.uploader || info.channel || "Unknown channel",
            viewCount: info.view_count ?? null,
            duration: info.duration ?? null,
            uploadDate: info.upload_date || null,
          },
        });
      } catch {
        resolve({ ok: false, error: "Failed to parse video info." });
      }
    });

    proc.on("error", (e) =>
      resolve({ ok: false, error: `Failed to start yt-dlp: ${e.message}` })
    );
  });
});

ipcMain.on("download:start", (event, { url, format }) => {
  if (typeof url !== "string" || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    event.sender.send("download:done", { success: false, error: "Invalid YouTube URL." });
    return;
  }
  event.sender.send("download:status", "Downloading...");
  runDownload(event, url, format);
});

function runDownload(event, url, format) {
  const downloadsDir = app.getPath("downloads");
  const args = buildArgs(url, format, downloadsDir);

  const proc = spawn(ytDlpPath, args, { windowsHide: true });

  let savedFile = null;
  let stderr = "";

  proc.stdout.on("data", (data) => {
    const text = data.toString();

    const progressMatch = text.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (progressMatch) {
      const etaMatch = text.match(/ETA\s+(\d{2}:\d{2}(?::\d{2})?)/);
      event.sender.send("download:progress", {
        percent: parseFloat(progressMatch[1]),
        eta: etaMatch ? etaMatch[1] : null,
      });
    }

    const destMatch = text.match(/Destination:\s+(.+)/);
    const mergeMatch = text.match(/Merging formats into "(.+)"/);
    const extractMatch = text.match(/\[ExtractAudio\] Destination: (.+)/);
    if (mergeMatch) savedFile = mergeMatch[1].trim();
    else if (destMatch) savedFile = destMatch[1].trim();
    else if (extractMatch) savedFile = extractMatch[1].trim();
  });

  proc.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  proc.on("close", (code) => {
    if (code === 0) {
      event.sender.send("download:done", {
        success: true,
        filePath: savedFile || downloadsDir,
      });
    } else {
      const errLine = stderr
        .split(/\r?\n/)
        .filter((l) => /error/i.test(l))
        .pop();
      event.sender.send("download:done", {
        success: false,
        error: errLine || `yt-dlp exited with code ${code}`,
      });
    }
  });

  proc.on("error", (err) => {
    event.sender.send("download:done", {
      success: false,
      error: `Failed to start yt-dlp: ${err.message}`,
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
