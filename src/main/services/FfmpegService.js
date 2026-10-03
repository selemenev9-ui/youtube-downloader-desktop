const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

class FfmpegService {
  constructor({ ffmpeg, ffprobe }) {
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
  }

  run(executable, args, { signal, onLine, cwd } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        windowsHide: true,
        shell: false,
        signal,
      });
      let stdout = "";
      let stderr = "";
      const consume = (chunk, isError) => {
        const value = chunk.toString();
        if (isError) stderr += value;
        else stdout += value;
        value
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((line) => onLine?.(line));
      };
      child.stdout.on("data", (data) => consume(data, false));
      child.stderr.on("data", (data) => consume(data, true));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(
            new Error(
              stderr.split(/\r?\n/).filter(Boolean).at(-1) ||
                `FFmpeg exited with code ${code}.`,
            ),
          );
      });
    });
  }

  async inspect(inputPath) {
    const { stdout } = await this.run(this.ffprobe, [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,format_name:stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      inputPath,
    ]);
    const data = JSON.parse(stdout);
    const duration = Number(data.format?.duration);
    const size = Number(data.format?.size);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Could not read the media duration.");
    return {
      path: inputPath,
      name: path.basename(inputPath),
      duration,
      size: Number.isFinite(size) ? size : 0,
      hasVideo:
        data.streams?.some((stream) => stream.codec_type === "video") || false,
      hasAudio:
        data.streams?.some((stream) => stream.codec_type === "audio") || false,
    };
  }

  uniqueOutput(outputDir, inputPath, targetMb) {
    const base = path
      .basename(inputPath, path.extname(inputPath))
      .replace(/[<>:"/\\|?*]/g, "_");
    const stem = `${base} - ${targetMb}MB`;
    let candidate = path.join(outputDir, `${stem}.mp4`);
    let suffix = 2;
    while (fs.existsSync(candidate))
      candidate = path.join(outputDir, `${stem} (${suffix++}).mp4`);
    return candidate;
  }

  async compressToSize({ inputPath, targetMb, outputDir, signal, onProgress }) {
    const target = Number(targetMb);
    if (!Number.isFinite(target) || target < 1 || target > 2000)
      throw new Error("Choose a target between 1 MB and 2000 MB.");
    const info = await this.inspect(inputPath);
    if (!info.hasVideo)
      throw new Error("Fit to size currently supports video files.");

    const audioKbps = info.hasAudio ? (target <= 20 ? 96 : 128) : 0;
    const usableBits = target * 1024 * 1024 * 8 * 0.94;
    const videoKbps = Math.floor(usableBits / info.duration / 1000 - audioKbps);
    if (videoKbps < 80)
      throw new Error(
        "This target is too small for the selected video's duration. Choose a larger size.",
      );

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "vantafetch-encode-"),
    );
    const passLog = path.join(tempDir, "pass");
    const outputPath = this.uniqueOutput(outputDir, inputPath, target);
    const videoArgs = [
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-b:v",
      `${videoKbps}k`,
      "-maxrate",
      `${videoKbps}k`,
      "-bufsize",
      `${videoKbps * 2}k`,
      "-pix_fmt",
      "yuv420p",
    ];
    const progress = (offset, span) => {
      let outTimeMs = 0;
      return (line) => {
        if (line.startsWith("out_time_ms=")) outTimeMs = Number(line.slice(12));
        if (line === "progress=continue" || line === "progress=end") {
          const ratio = Math.min(
            1,
            Math.max(0, outTimeMs / 1_000_000 / info.duration),
          );
          onProgress?.(Math.round(offset + ratio * span));
        }
      };
    };

    try {
      onProgress?.(1);
      await this.run(
        this.ffmpeg,
        [
          "-y",
          "-i",
          inputPath,
          ...videoArgs,
          "-pass",
          "1",
          "-passlogfile",
          passLog,
          "-an",
          "-f",
          "mp4",
          "NUL",
          "-progress",
          "pipe:1",
          "-nostats",
        ],
        { signal, cwd: tempDir, onLine: progress(1, 47) },
      );
      const audioArgs = info.hasAudio
        ? ["-c:a", "aac", "-b:a", `${audioKbps}k`]
        : ["-an"];
      await this.run(
        this.ffmpeg,
        [
          "-y",
          "-i",
          inputPath,
          ...videoArgs,
          "-pass",
          "2",
          "-passlogfile",
          passLog,
          ...audioArgs,
          "-movflags",
          "+faststart",
          outputPath,
          "-progress",
          "pipe:1",
          "-nostats",
        ],
        { signal, cwd: tempDir, onLine: progress(49, 50) },
      );
      const outputSize = fs.statSync(outputPath).size;
      onProgress?.(100);
      return { outputPath, outputSize, targetMb: target };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

module.exports = { FfmpegService };
