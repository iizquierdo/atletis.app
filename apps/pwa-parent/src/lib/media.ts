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

export const extractObjectKey = (storedUrl: string): string | null => {
  const url = String(storedUrl || "").trim();
  if (!url) return null;

  const storageMatch = url.match(/\/storage\/([^?#]+)/);
  if (storageMatch?.[1]) return normalizeKey(storageMatch[1]);

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return null;
  }

  if (url.startsWith("/")) return normalizeKey(url.slice(1));
  if (!url.includes("://")) return normalizeKey(url);
  return null;
};

export const resolveMediaUrl = (raw?: string | null): string | null => {
  const url = String(raw || "").trim();
  if (!url) return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const storageIdx = url.indexOf("/storage/");
    if (storageIdx >= 0) {
      const key = extractObjectKey(url);
      return key ? storageUrl(key) : url.split("?")[0] || null;
    }
    return url;
  }

  const key = extractObjectKey(url);
  if (key) return storageUrl(key);

  if (url.startsWith("/")) return url.split("?")[0] || null;
  return storageUrl(url);
};

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"];

export const isDisplayableImageUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const path = url.split("?")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
};

export const isDisplayableVideoUrl = (url?: string | null): boolean =>
  [".mp4", ".webm", ".mov", ".m3u8"].some((ext) =>
    String(url || "")
      .split("?")[0]
      .toLowerCase()
      .endsWith(ext)
  );
