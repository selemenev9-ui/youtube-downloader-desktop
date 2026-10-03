const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const rawFs = process.versions.electron ? require("original-fs") : fs;

const REPOSITORY = "selemenev9-ui/youtube-downloader-desktop";
const RELEASES_PREFIX = `https://github.com/${REPOSITORY}/releases/`;
const DOWNLOADS_PREFIX = `https://github.com/${REPOSITORY}/releases/download/`;

function parseVersion(value) {
  const match = String(value || "")
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] || null,
  };
}

function isNewerVersion(remoteValue, currentValue) {
  const remote = parseVersion(remoteValue);
  const current = parseVersion(currentValue);
  if (!remote || !current) return false;
  for (let index = 0; index < 3; index += 1) {
    if (remote.numbers[index] !== current.numbers[index])
      return remote.numbers[index] > current.numbers[index];
  }
  if (!remote.prerelease && current.prerelease) return true;
  if (remote.prerelease && !current.prerelease) return false;
  if (!remote.prerelease || !current.prerelease) return false;
  const remoteParts = remote.prerelease.split(".");
  const currentParts = current.prerelease.split(".");
  for (
    let index = 0;
    index < Math.max(remoteParts.length, currentParts.length);
    index += 1
  ) {
    if (remoteParts[index] === undefined) return false;
    if (currentParts[index] === undefined) return true;
    if (remoteParts[index] === currentParts[index]) continue;
    const remoteNumber = /^\d+$/.test(remoteParts[index])
      ? Number(remoteParts[index])
      : null;
    const currentNumber = /^\d+$/.test(currentParts[index])
      ? Number(currentParts[index])
      : null;
    if (remoteNumber !== null && currentNumber !== null)
      return remoteNumber > currentNumber;
    if (remoteNumber !== null) return false;
    if (currentNumber !== null) return true;
    return remoteParts[index] > currentParts[index];
  }
  return false;
}

class UpdateService {
  constructor({ currentVersion, moduleDirectory }) {
    this.currentVersion = currentVersion;
    this.moduleDirectory = moduleDirectory;
    this.latest = null;
  }

  headers() {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": `VantaFetch/${this.currentVersion}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async check() {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(6500),
        },
      );
      if (!response.ok) return { ok: false, available: false };
      const release = await response.json();
      const url =
        typeof release.html_url === "string" &&
        release.html_url.startsWith(RELEASES_PREFIX)
          ? release.html_url
          : null;
      const available = Boolean(
        url && isNewerVersion(release.tag_name, this.currentVersion),
      );
      let moduleUpdate = null;
      if (available) {
        const manifestAsset = release.assets?.find(
          (asset) => asset.name === "vantafetch-update.json",
        );
        if (manifestAsset?.browser_download_url?.startsWith(DOWNLOADS_PREFIX)) {
          const manifestResponse = await fetch(
            manifestAsset.browser_download_url,
            {
              headers: this.headers(),
              signal: AbortSignal.timeout(6500),
            },
          );
          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            const moduleAsset = release.assets?.find(
              (asset) => asset.name === manifest.module?.asset,
            );
            if (
              manifest.schema === 1 &&
              manifest.bootstrap === 1 &&
              manifest.version ===
                String(release.tag_name).replace(/^v/i, "") &&
              /^[a-f0-9]{64}$/i.test(manifest.module?.sha256 || "") &&
              moduleAsset?.browser_download_url?.startsWith(DOWNLOADS_PREFIX)
            ) {
              moduleUpdate = {
                version: manifest.version,
                sha256: manifest.module.sha256.toLowerCase(),
                size: Number(manifest.module.size) || moduleAsset.size,
                asset: moduleAsset.name,
                downloadUrl: moduleAsset.browser_download_url,
              };
            }
          }
        }
      }
      const result = {
        ok: true,
        available,
        currentVersion: this.currentVersion,
        version: String(release.tag_name).replace(/^v/i, ""),
        name: release.name || release.tag_name,
        url,
        updateType: moduleUpdate ? "module" : available ? "full" : null,
        size: moduleUpdate?.size || null,
      };
      this.latest = moduleUpdate ? { ...moduleUpdate, url } : null;
      return result;
    } catch {
      return { ok: false, available: false };
    }
  }

  async install(onProgress) {
    if (!this.latest) {
      const status = await this.check();
      if (!status.available || status.updateType !== "module" || !this.latest)
        throw new Error("A modular update is not available.");
    }
    const response = await fetch(this.latest.downloadUrl, {
      headers: this.headers(),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok || !response.body)
      throw new Error("Could not download the update package.");
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.length;
      onProgress?.(
        Math.min(99, Math.round((received / this.latest.size) * 100)),
      );
    }
    const data = Buffer.concat(chunks);
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (data.length !== this.latest.size || digest !== this.latest.sha256)
      throw new Error(
        "Update verification failed. The existing version was not changed.",
      );

    rawFs.mkdirSync(this.moduleDirectory, { recursive: true });
    const fileName = path.basename(this.latest.asset);
    const finalPath = path.join(this.moduleDirectory, fileName);
    const temporaryPath = `${finalPath}.download`;
    rawFs.writeFileSync(temporaryPath, data);
    rawFs.renameSync(temporaryPath, finalPath);
    const activePath = path.join(this.moduleDirectory, "active.json");
    let active = null;
    try {
      active = JSON.parse(rawFs.readFileSync(activePath, "utf8"));
    } catch {}
    rawFs.writeFileSync(
      activePath,
      JSON.stringify({
        current: {
          file: fileName,
          sha256: digest,
          version: this.latest.version,
        },
        previous: active?.current || null,
      }),
      "utf8",
    );
    onProgress?.(100);
    return { ready: true, version: this.latest.version };
  }
}

module.exports = { UpdateService, isNewerVersion, RELEASES_PREFIX };
