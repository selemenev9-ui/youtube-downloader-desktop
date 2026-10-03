const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

class JobManager extends EventEmitter {
  constructor({ downloader, outputDir }) { super(); this.downloader = downloader; this.outputDir = outputDir; this.jobs = new Map(); this.queue = []; this.active = null; }
  create(input) {
    const job = { id: randomUUID(), state: "queued", progress: 0, eta: null, createdAt: Date.now(), ...input };
    this.jobs.set(job.id, job); this.queue.push(job.id); this.emitJob(job); this.drain(); return { ...job };
  }
  emitJob(job) { this.emit("change", { ...job }); }
  patch(job, patch) { Object.assign(job, patch); this.emitJob(job); }
  async drain() {
    if (this.active || !this.queue.length) return;
    const job = this.jobs.get(this.queue.shift()); if (!job) return this.drain();
    this.active = job.id; const controller = new AbortController(); job.controller = controller;
    try {
      this.patch(job, { state: "downloading" });
      const result = await this.downloader.download({ inputUrl: job.url, format: job.format, outputDir: this.outputDir, signal: controller.signal, onProgress: (p) => this.patch(job, { progress: p.percent, eta: p.eta }) });
      this.patch(job, { state: "completed", progress: 100, outputPath: result.outputPath });
    } catch (error) { this.patch(job, { state: controller.signal.aborted ? "cancelled" : "failed", error: error.message }); }
    finally { delete job.controller; this.active = null; this.drain(); }
  }
  cancel(id) { const job = this.jobs.get(id); if (!job) return false; if (job.state === "queued") { this.queue = this.queue.filter((x) => x !== id); this.patch(job, { state: "cancelled" }); return true; } if (job.controller) { job.controller.abort(); return true; } return false; }
}

module.exports = { JobManager };
