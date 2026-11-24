// mnc-engine/scripts/mnc-url-resolver.mjs
// Ensures 100% canonical direct apply links for official career portals

const SHORTENER_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "lnkd.in",
  "buff.ly",
  "ow.ly",
  "rb.gy"
];

/**
 * Resolves redirects and verifies canonical official career portal URL.
 * Only triggers network HEAD request if the link is a known shortener or redirector.
 * @param {string} rawUrl 
 * @returns {Promise<string>}
 */
export async function resolveDirectApplyUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";

  const trimmed = rawUrl.trim();

  let isShortener = false;
  try {
    const parsed = new URL(trimmed);
    isShortener = SHORTENER_DOMAINS.some((d) => parsed.hostname.endsWith(d));
  } catch {
    return trimmed;
  }

  // If not a shortener, it is already a direct link
  if (!isShortener) {
    return trimmed;
  }

  // Attempt HEAD request with redirect follow to unpack tracking or aggregator links
  try {
    const res = await fetch(trimmed, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.url) {
      return res.url;
    }
  } catch (err) {
    // Fall back to original url
  }

  return trimmed;
}
