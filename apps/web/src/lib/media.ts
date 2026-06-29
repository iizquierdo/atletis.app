import { assetUrl } from './api-base';

const normalizeKey = (key: string): string =>
  String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^api\/storage\//, '')
    .replace(/^storage\//, '');

export const extractObjectKey = (storedUrl: string): string | null => {
  const url = String(storedUrl || '').trim();
  if (!url) return null;

  const storageMatch = url.match(/\/(?:api\/)?storage\/([^?#]+)/);
  if (storageMatch?.[1]) return normalizeKey(storageMatch[1]);

  if (url.startsWith('http://') || url.startsWith('https://')) return null;

  if (url.startsWith('/')) return normalizeKey(url.slice(1));
  if (!url.includes('://')) return normalizeKey(url);
  return null;
};

export const resolveMediaUrl = (raw?: string | null): string | null => {
  const url = String(raw || '').trim();
  if (!url) return null;

  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const key = extractObjectKey(url);
    return key ? assetUrl(`/storage/${key}`) : url;
  }

  const key = extractObjectKey(url);
  if (key) return assetUrl(`/storage/${key}`);

  if (url.startsWith('/')) return assetUrl(url);
  return assetUrl(`/storage/${normalizeKey(url)}`);
};

export const mediaUrl = (raw?: string | null): string => resolveMediaUrl(raw) || '';
