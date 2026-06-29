// Centralized backend URL.
//
// Dev: leave VITE_API_BASE_URL unset — Vite's dev server proxies /api and /storage
// to VITE_API_PROXY_TARGET, so plain fetch('/api/foo') works.
//
// Prod (two-service deploy): set VITE_API_BASE_URL=https://<api-domain> at BUILD
// time. The installFetchRewrite() patch below transparently redirects every
// /api/* and /storage/* call to that backend so existing code stays untouched.
import { joinApiPath, normalizeApiBase } from './normalize-api-base';

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || '');
const AUTH_STORAGE_KEY = 'sinapsis.auth.session';

const shouldRewrite = (url: string): boolean =>
  url.startsWith('/api/') || url === '/api' || url.startsWith('/storage/') || url === '/storage';

const rewrite = (url: string): string => {
  if (!API_BASE || !shouldRewrite(url)) return url;
  return joinApiPath(API_BASE, url);
};

const getUserToken = (): string => {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? String(JSON.parse(raw)?.token || '') : '';
  } catch {
    return '';
  }
};

const isUserApiRequest = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin);
    const apiBaseOrigin = API_BASE && !API_BASE.startsWith('/') ? new URL(API_BASE).origin : '';
    const isKnownOrigin = parsed.origin === window.location.origin || (apiBaseOrigin && parsed.origin === apiBaseOrigin);
    return Boolean(isKnownOrigin && parsed.pathname.startsWith('/api/') && !parsed.pathname.startsWith('/api/admin/'));
  } catch {
    return false;
  }
};

const withUserAuth = (url: string, init?: RequestInit, fallbackHeaders?: HeadersInit): RequestInit | undefined => {
  if (!isUserApiRequest(url)) return init;
  const token = getUserToken();
  if (!token) return init;

  const headers = new Headers(init?.headers || fallbackHeaders);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return {
    ...(init || {}),
    headers
  };
};

export const apiUrl = (path: string): string => (shouldRewrite(path) ? rewrite(path) : path);

export const assetUrl = (url: string | null | undefined): string => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('/storage/') || value === '/storage') {
    return rewrite(`/api${value}`);
  }
  return shouldRewrite(value) ? rewrite(value) : value;
};

let installed = false;

export const installFetchRewrite = (): void => {
  if (installed || !API_BASE || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      const next = rewrite(input);
      return nativeFetch(next, withUserAuth(next, init));
    }
    if (input instanceof URL) {
      if (input.origin === window.location.origin && shouldRewrite(input.pathname)) {
        const next = rewrite(input.pathname + input.search + input.hash);
        return nativeFetch(next, withUserAuth(next, init));
      }
      return nativeFetch(input, withUserAuth(input.toString(), init));
    }
    const reqUrl = new URL(input.url, window.location.origin);
    if (reqUrl.origin === window.location.origin && shouldRewrite(reqUrl.pathname)) {
      const nextUrl = rewrite(reqUrl.pathname + reqUrl.search + reqUrl.hash);
      const next = new Request(nextUrl, input);
      return nativeFetch(next, withUserAuth(nextUrl, init, next.headers));
    }
    return nativeFetch(input, withUserAuth(input.url, init, input.headers));
  };

  const OriginalXHR = window.XMLHttpRequest;
  class PatchedXHR extends OriginalXHR {
    open(method: string, url: string | URL, ...rest: unknown[]): void {
      const u = typeof url === 'string' ? url : url.toString();
      const next = u.startsWith('/') ? rewrite(u) : u;
      // @ts-expect-error variadic forwarding
      super.open(method, next, ...rest);
    }
  }
  window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;
};

// Patch fetch as soon as this module loads — static imports in index.tsx are hoisted,
// so i18n.ts can fire fetch() before index.tsx body runs installFetchRewrite().
if (typeof window !== 'undefined' && API_BASE) {
  installFetchRewrite();
}
