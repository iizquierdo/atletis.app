import type { CorsOptions } from 'cors';

/** WEB_ORIGIN: comma-separated allowed browser origins, or * for dev. */
export const buildCorsOptions = (): CorsOptions => {
  const raw = String(process.env.WEB_ORIGIN ?? '').trim();
  if (!raw || raw === '*') {
    return { origin: true, credentials: true };
  }
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  };
};
