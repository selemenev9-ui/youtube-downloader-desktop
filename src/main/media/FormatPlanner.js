const QUALITY_TIERS = [2160, 1440, 1080, 720, 480, 360];
const LABELS = { 2160: "2160p (4K)", 1440: "1440p (2K)", 1080: "1080p (Full HD)", 720: "720p (HD)", 480: "480p", 360: "360p" };

function availableChoices(info) {
  const heights = (info.formats || []).filter((f) => f.vcodec && f.vcodec !== "none" && f.height).map((f) => Number(f.height));
  const maxHeight = heights.length ? Math.max(...heights) : 0;
  const choices = [{ id: "best", label: "Best available" }];
  for (const height of QUALITY_TIERS) if (maxHeight >= height) choices.push({ id: String(height), label: LABELS[height] });
  choices.push({ id: "audio", label: "Audio Only (MP3)" });
  return choices;
}

function downloadPlan(choice) {
  if (choice === "audio") return { kind: "audio", args: ["-x", "--audio-format", "mp3", "--audio-quality", "0"] };
  if (choice === "best") return { kind: "video", args: ["-f", "bv*+ba/b", "--merge-output-format", "mp4"] };
  const height = Number.parseInt(choice, 10);
  if (!Number.isFinite(height) || height < 144 || height > 4320) throw new Error("Unsupported quality selection.");
  return { kind: "video", args: ["-f", `bv*[height<=?${height}]+ba/b[height<=?${height}]`, "--merge-output-format", "mp4"] };
}

module.exports = { availableChoices, downloadPlan };
