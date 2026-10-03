function platformName(info) {
  const key = String(info.extractor_key || info.extractor || info.webpage_url_domain || "Web").toLowerCase();
  if (key.includes("youtube")) return "YouTube";
  if (key.includes("tiktok")) return "TikTok";
  if (key.includes("instagram")) return "Instagram";
  if (key.includes("twitch")) return "Twitch";
  if (key.includes("kick")) return "Kick";
  if (key.includes("twitter") || key.includes("x.com")) return "X / Twitter";
  if (key.includes("vimeo")) return "Vimeo";
  return info.webpage_url_domain || info.extractor_key || "Web";
}

function normalizeMetadata(info) {
  const width = Number(info.width) || null, height = Number(info.height) || null;
  return {
    id: info.id || null,
    title: info.title || "Untitled media",
    thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || null,
    uploader: info.uploader || info.channel || info.creator || "Unknown creator",
    viewCount: info.view_count ?? null,
    duration: info.duration ?? null,
    uploadDate: info.upload_date || null,
    platform: platformName(info),
    extractor: info.extractor_key || info.extractor || null,
    width,
    height,
    orientation: width && height && height > width ? "portrait" : "landscape",
    isLive: Boolean(info.is_live || info.live_status === "is_live"),
    webpageUrl: info.webpage_url || null,
  };
}

module.exports = { normalizeMetadata };
