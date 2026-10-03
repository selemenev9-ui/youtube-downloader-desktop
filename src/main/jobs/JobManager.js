const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

class JobManager extends EventEmitter {
  constructor({ downloader, outputDir }) {
    super();
    this.downloader = downloader;
    this.outputDir = outputDir;
    this.jobs = new Map();
    this.queue = [];
    this.active = null;
  }
  create(input) {
    const job = {
      id: randomUUID(),
      state: "queued",
      progress: 0,
      eta: null,
      createdAt: Date.now(),
      ...input,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.emitJob(job);
    this.drain();
    const { controller, ...publicJob } = job;
    return { ...publicJob };
  }
  emitJob(job) {
    const { controller, ...publicJob } = job;
    this.emit("change", { ...publicJob });
  }
  patch(job, patch) {
    Object.assign(job, patch);
    this.emitJob(job);
  }
  async drain() {
    if (this.active || !this.queue.length) return;
    const job = this.jobs.get(this.queue.shift());
    if (!job) return this.drain();
    this.active = job.id;
    const controller = new AbortController();
    job.controller = controller;
    let liveTimer = null;
    try {
      this.patch(job, { state: "downloading" });
      if (Number(job.liveDuration) > 0) {
        const startedAt = Date.now();
        liveTimer = setInterval(() => {
          const elapsed = (Date.now() - startedAt) / 1000;
          this.patch(job, {
            progress: Math.min(99, (elapsed / job.liveDuration) * 100),
            eta: Math.max(0, Math.ceil(job.liveDuration - elapsed)),
          });
        }, 1000);
      }
      const result = await this.downloader.download({
        inputUrl: job.url,
        format: job.format,
        liveDuration: job.liveDuration,
        outputDir: this.outputDir,
        signal: controller.signal,
        onProgress: (p) => this.patch(job, { progress: p.percent, eta: p.eta }),
      });
      this.patch(job, {
        state: "completed",
        progress: 100,
        outputPath: result.outputPath,
      });
    } catch (error) {
      this.patch(job, {
        state: controller.signal.aborted ? "cancelled" : "failed",
        error: error.message,
      });
    } finally {
      if (liveTimer) clearInterval(liveTimer);
      delete job.controller;
      this.active = null;
      this.drain();
    }
  }
  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.state === "queued") {
      this.queue = this.queue.filter((x) => x !== id);
      this.patch(job, { state: "cancelled" });
      return true;
    }
    if (job.controller) {
      job.controller.abort();
      return true;
    }
    return false;
  }
}

module.exports = { JobManager };
