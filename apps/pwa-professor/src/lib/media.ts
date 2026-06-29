/**
 * Resolves persisted file URLs to `/storage/<key>` so the PWA dev server (and
 * production reverse proxy) can always fetch objects through the Sinapsis API,
 * regardless of the storage publicUrl configured in admin settings.
 */

const normalizeKey = (key: string): string =>
  String(key || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^storage\//, "");

const apiBaseUrl = String(import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

const storageUrl = (key: string): string => {
  const normalized = normalizeKey(key);
  if (!apiBaseUrl || apiBaseUrl === "/api") return `/storage/${normalized}`;
  return `${apiBaseUrl}/storage/${normalized}`;
};

/** Extract the object key from any URL format we may have stored in the DB. */
export const extractObjectKey = (storedUrl: string): string | null => {
  const url = String(storedUrl || "").trim();
  if (!url) return null;

  const storageMatch = url.match(/\/storage\/([^?#]+)/);
  if (storageMatch?.[1]) return normalizeKey(storageMatch[1]);

  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/+/, "");
      if (path) return normalizeKey(path);
    } catch {
      return null;
    }
  }

  if (url.startsWith("/")) {
    return normalizeKey(url.slice(1));
  }

  if (!url.includes("://")) {
    return normalizeKey(url);
  }

  return null;
};

/**
 * Canonical URL for this PWA: always `/storage/<key>` (proxied to the API).
 * Rebuilds from absolute CDN URLs, web-app hosts, or bare storage keys.
 */
export const resolveMediaUrl = (raw?: string | null): string | null => {
  const url = String(raw || "").trim();
  if (!url) return null;

  const key = extractObjectKey(url);
  if (key) return storageUrl(key);

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const storageIdx = url.indexOf("/storage/");
    if (storageIdx >= 0) return url.slice(storageIdx).split("?")[0] || null;
    return url;
  }

  if (url.startsWith("/")) return url.split("?")[0] || null;
  return storageUrl(url);
};
