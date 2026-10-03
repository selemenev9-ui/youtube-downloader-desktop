const REPOSITORY = "selemenev9-ui/youtube-downloader-desktop";
const RELEASES_PREFIX = `https://github.com/${REPOSITORY}/releases/`;

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
  constructor({ currentVersion }) {
    this.currentVersion = currentVersion;
  }

  async check() {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": `VantaFetch/${this.currentVersion}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
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
      return {
        ok: true,
        available: Boolean(
          url && isNewerVersion(release.tag_name, this.currentVersion),
        ),
        currentVersion: this.currentVersion,
        version: release.tag_name,
        name: release.name || release.tag_name,
        url,
      };
    } catch {
      return { ok: false, available: false };
    }
  }
}

module.exports = { UpdateService, isNewerVersion, RELEASES_PREFIX };
