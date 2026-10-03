const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHECK_INTERVAL = 12 * 60 * 60 * 1000;

class EngineUpdateService {
  constructor({ bundledExecutable, dataDirectory }) {
    this.bundledExecutable = bundledExecutable;
    this.dataDirectory = dataDirectory;
    this.executable = path.join(dataDirectory, "yt-dlp.exe");
    this.statePath = path.join(dataDirectory, "update-state.json");
  }

  run(args, timeoutMs = 60000, executable = this.executable) {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        shell: false,
      });
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Engine update timed out."));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output.trim());
        else
          reject(
            new Error(output.trim() || `Engine exited with code ${code}.`),
          );
      });
    });
  }

  async version(executable = this.executable) {
    return (await this.run(["--version"], 10000, executable))
      .split(/\r?\n/)[0]
      .trim();
  }

  async prepare() {
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    if (!fs.existsSync(this.executable))
      fs.copyFileSync(this.bundledExecutable, this.executable);
    try {
      await this.version();
    } catch {
      fs.copyFileSync(this.bundledExecutable, this.executable);
      await this.version();
    }
    return this.executable;
  }

  readState() {
    try {
      return JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    } catch {
      return {};
    }
  }

  async checkAndUpdate({ force = false } = {}) {
    const before = await this.version();
    const state = this.readState();
    if (!force && Date.now() - Number(state.checkedAt || 0) < CHECK_INTERVAL)
      return { checked: false, updated: false, version: before };
    const candidate = path.join(this.dataDirectory, "yt-dlp.update.exe");
    const backup = path.join(this.dataDirectory, "yt-dlp.backup.exe");
    try {
      fs.copyFileSync(this.executable, candidate);
      const message = await this.run(
        ["--update-to", "stable"],
        120000,
        candidate,
      );
      const after = await this.version(candidate);
      if (before !== after) {
        fs.copyFileSync(this.executable, backup);
        fs.copyFileSync(candidate, this.executable);
        await this.version();
      }
      fs.writeFileSync(
        this.statePath,
        JSON.stringify({ checkedAt: Date.now(), version: after }),
        "utf8",
      );
      return {
        checked: true,
        updated: before !== after,
        version: after,
        previousVersion: before,
        message,
      };
    } catch (error) {
      if (fs.existsSync(backup)) {
        try {
          fs.copyFileSync(backup, this.executable);
        } catch {}
      }
      fs.writeFileSync(
        this.statePath,
        JSON.stringify({
          checkedAt: Date.now(),
          version: before,
          error: error.message,
        }),
        "utf8",
      );
      return {
        checked: true,
        updated: false,
        version: before,
        error: error.message,
      };
    } finally {
      try {
        fs.rmSync(candidate, { force: true });
      } catch {}
    }
  }
}

module.exports = { EngineUpdateService };
