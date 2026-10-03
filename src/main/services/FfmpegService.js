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
      width:
        data.streams?.find((stream) => stream.codec_type === "video")?.width ||
        null,
      height:
        data.streams?.find((stream) => stream.codec_type === "video")?.height ||
        null,
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

  namedOutput(outputDir, inputPath, suffix, extension) {
    const base = path
      .basename(inputPath, path.extname(inputPath))
      .replace(/[<>:"/\\|?*]/g, "_");
    let candidate = path.join(outputDir, `${base} - ${suffix}.${extension}`);
    let number = 2;
    while (fs.existsSync(candidate))
      candidate = path.join(
        outputDir,
        `${base} - ${suffix} (${number++}).${extension}`,
      );
    return candidate;
  }

  progressFor(duration, onProgress) {
    let outTimeMs = 0;
    return (line) => {
      if (line.startsWith("out_time_ms=")) outTimeMs = Number(line.slice(12));
      if (line === "progress=continue" || line === "progress=end") {
        const ratio = Math.min(
          1,
          Math.max(0, outTimeMs / 1_000_000 / duration),
        );
        onProgress?.(Math.round(ratio * 100));
      }
    };
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

  async extractAudio({ inputPath, format, outputDir, signal, onProgress }) {
    const selected = String(format).toLowerCase();
    if (!["flac", "wav"].includes(selected))
      throw new Error("Choose FLAC or WAV.");
    const info = await this.inspect(inputPath);
    if (!info.hasAudio)
      throw new Error("The selected file has no audio track.");
    const outputPath = this.namedOutput(
      outputDir,
      inputPath,
      "audio",
      selected,
    );
    const codec =
      selected === "flac"
        ? ["-c:a", "flac", "-compression_level", "8"]
        : ["-c:a", "pcm_s24le"];
    await this.run(
      this.ffmpeg,
      [
        "-y",
        "-i",
        inputPath,
        "-vn",
        ...codec,
        outputPath,
        "-progress",
        "pipe:1",
        "-nostats",
      ],
      { signal, onLine: this.progressFor(info.duration, onProgress) },
    );
    onProgress?.(100);
    return {
      outputPath,
      outputSize: fs.statSync(outputPath).size,
      format: selected,
    };
  }

  async createAnimation({
    inputPath,
    format,
    start,
    duration,
    outputDir,
    signal,
    onProgress,
  }) {
    const selected = String(format).toLowerCase();
    if (!["gif", "webp"].includes(selected))
      throw new Error("Choose GIF or WebP.");
    const info = await this.inspect(inputPath);
    if (!info.hasVideo)
      throw new Error("The selected file has no video track.");
    const clipStart = Math.max(0, Number(start) || 0);
    const clipDuration = Math.min(
      30,
      Math.max(1, Number(duration) || 6),
      info.duration - clipStart,
    );
    if (clipDuration <= 0)
      throw new Error("The start time is outside the video.");
    const outputPath = this.namedOutput(
      outputDir,
      inputPath,
      "animation",
      selected,
    );
    const encoding =
      selected === "gif"
        ? [
            "-filter_complex",
            "[0:v]fps=12,scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=sierra2_4a",
            "-loop",
            "0",
          ]
        : [
            "-vf",
            "fps=15,scale=720:-2:flags=lanczos",
            "-c:v",
            "libwebp_anim",
            "-q:v",
            "76",
            "-loop",
            "0",
          ];
    await this.run(
      this.ffmpeg,
      [
        "-y",
        "-ss",
        String(clipStart),
        "-t",
        String(clipDuration),
        "-i",
        inputPath,
        ...encoding,
        "-an",
        outputPath,
        "-progress",
        "pipe:1",
        "-nostats",
      ],
      { signal, onLine: this.progressFor(clipDuration, onProgress) },
    );
    onProgress?.(100);
    return {
      outputPath,
      outputSize: fs.statSync(outputPath).size,
      format: selected,
    };
  }

  async applyWatermark({
    inputPath,
    watermarkPath,
    position,
    scale,
    opacity,
    outputDir,
    signal,
    onProgress,
  }) {
    const info = await this.inspect(inputPath);
    if (!info.hasVideo || !info.width)
      throw new Error("The selected file has no readable video track.");
    if (!watermarkPath || !fs.existsSync(watermarkPath))
      throw new Error("Choose a watermark image first.");
    const sizePercent = Math.min(50, Math.max(5, Number(scale) || 15));
    const alpha = Math.min(1, Math.max(0.05, Number(opacity) || 0.75));
    const width = Math.max(32, Math.round((info.width * sizePercent) / 100));
    const margin = Math.max(12, Math.round(info.width * 0.012));
    const positions = {
      topLeft: `${margin}:${margin}`,
      topRight: `W-w-${margin}:${margin}`,
      center: `(W-w)/2:(H-h)/2`,
      bottomLeft: `${margin}:H-h-${margin}`,
      bottomRight: `W-w-${margin}:H-h-${margin}`,
    };
    const overlay = positions[position] || positions.bottomRight;
    const outputPath = this.namedOutput(
      outputDir,
      inputPath,
      "watermarked",
      "mp4",
    );
    const filter = `[1:v]format=rgba,colorchannelmixer=aa=${alpha},scale=${width}:-1:flags=lanczos[wm];[0:v][wm]overlay=${overlay}:format=auto`;
    await this.run(
      this.ffmpeg,
      [
        "-y",
        "-i",
        inputPath,
        "-loop",
        "1",
        "-i",
        watermarkPath,
        "-filter_complex",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        ...(info.hasAudio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        "-t",
        String(info.duration),
        "-movflags",
        "+faststart",
        outputPath,
        "-progress",
        "pipe:1",
        "-nostats",
      ],
      { signal, onLine: this.progressFor(info.duration, onProgress) },
    );
    onProgress?.(100);
    return { outputPath, outputSize: fs.statSync(outputPath).size };
  }
}

module.exports = { FfmpegService };
