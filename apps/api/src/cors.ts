import type { CorsOptions } from 'cors';

/** WEB_ORIGIN: comma-separated allowed browser origins, or * for dev. */
export const buildCorsOptions = (): CorsOptions => {
  const raw = String(process.env.WEB_ORIGIN ?? '').trim();
  if (!raw || raw === '*') {
    return { origin: true, credentials: true };
  }
  const toOrigin = (value: string) => {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed;
    }
  };
  const origins = [
    ...raw.split(','),
    process.env.VITE_PWA_PARENT_URL,
    process.env.PWA_PARENT_URL,
    process.env.VITE_PWA_PROFESSOR_URL,
    process.env.PWA_PROFESSOR_URL
  ]
    .map((o) => toOrigin(String(o || '')))
    .filter(Boolean);
  const uniqueOrigins = [...new Set(origins)];
  return {
    origin: uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins,
    credentials: true,
  };
};
