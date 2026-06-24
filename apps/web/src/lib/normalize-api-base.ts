/** Ensures VITE_API_BASE_URL is a full origin (required for cross-origin API on Railway). */
export const normalizeApiBase = (raw: string): string => {
  const trimmed = String(raw || '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const joinApiPath = (base: string, path: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return path;
  if (!path.startsWith('/')) return `${normalized}/${path}`;
  try {
    return new URL(path, `${normalized}/`).href;
  } catch {
    return `${normalized}${path}`;
  }
};
