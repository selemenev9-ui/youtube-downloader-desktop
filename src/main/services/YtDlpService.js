const { spawn } = require("child_process");
const path = require("path");
const { availableChoices, downloadPlan } = require("../media/FormatPlanner");
const { normalizeMetadata } = require("../media/MetadataNormalizer");
const { normalizeMediaUrl } = require("../media/url");

class YtDlpService {
  constructor({ executable, ffmpeg }) { this.executable = executable; this.ffmpeg = ffmpeg; }

  run(args, { onLine, signal } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, { windowsHide: true, shell: false, signal });
      let stdout = "", stderr = "";
      const consume = (chunk, isError) => {
        const text = chunk.toString();
        if (isError) stderr += text; else stdout += text;
        text.split(/\r?\n/).filter(Boolean).forEach((line) => onLine?.(line));
      };
      child.stdout.on("data", (d) => consume(d, false));
      child.stderr.on("data", (d) => consume(d, true));
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(this.friendlyError(stderr, code))));
    });
  }

  friendlyError(stderr, code) {
    const text = stderr || "";
    if (/login required|sign in|authentication|cookies/i.test(text)) return "This media requires a login and cannot be downloaded privately.";
    if (/private|not available/i.test(text)) return "This media is private or unavailable.";
    if (/unsupported url/i.test(text)) return "This website or URL is not supported by the current download engine.";
    return text.split(/\r?\n/).filter((line) => /error:/i.test(line)).at(-1)?.replace(/^.*?ERROR:\s*/i, "") || `Download engine exited with code ${code}.`;
  }

  async probe(inputUrl) {
    const url = normalizeMediaUrl(inputUrl);
    const { stdout } = await this.run(["--dump-single-json", "--no-playlist", "--skip-download", "--no-warnings", "--", url]);
    const info = JSON.parse(stdout);
    return { ok: true, formats: availableChoices(info), meta: normalizeMetadata(info) };
  }

  async download({ inputUrl, format, outputDir, onProgress, signal }) {
    const url = normalizeMediaUrl(inputUrl);
    const plan = downloadPlan(format);
    let outputPath = null;
    const args = ["--ffmpeg-location", this.ffmpeg, "--no-playlist", "--newline", "--progress-template", "download:progress:%(progress._percent_str)s|%(progress.eta)s", "--print", "after_move:filepath:%(filepath)s", "-o", path.join(outputDir, "%(title)s.%(ext)s"), ...plan.args, "--", url];
    await this.run(args, { signal, onLine: (line) => {
      if (line.startsWith("progress:")) {
        const [rawPercent, eta] = line.slice(9).split("|");
        const percent = Number.parseFloat(String(rawPercent).replace(/[^0-9.]/g, ""));
        if (Number.isFinite(percent)) onProgress?.({ percent, eta: eta && eta !== "NA" ? eta : null });
      } else if (line.startsWith("filepath:")) outputPath = line.slice(9).trim();
    }});
    return { outputPath: outputPath || outputDir, kind: plan.kind };
  }
}

module.exports = { YtDlpService };
