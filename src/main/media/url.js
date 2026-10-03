function normalizeMediaUrl(value) {
  if (typeof value !== "string") throw new Error("A media URL is required.");
  const trimmed = value.trim();
  let parsed;
  try { parsed = new URL(trimmed); } catch { throw new Error("Enter a valid media URL."); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS links are supported.");
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error("This URL cannot be used.");
  return parsed.toString();
}

module.exports = { normalizeMediaUrl };
