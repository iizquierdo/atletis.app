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

const shouldRewrite = (url: string): boolean =>
  url.startsWith('/api/') || url === '/api' || url.startsWith('/storage/') || url === '/storage';

const rewrite = (url: string): string => {
  if (!API_BASE || !shouldRewrite(url)) return url;
  return joinApiPath(API_BASE, url);
};

export const apiUrl = (path: string): string => (shouldRewrite(path) ? rewrite(path) : path);

let installed = false;

export const installFetchRewrite = (): void => {
  if (installed || !API_BASE || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(rewrite(input), init);
    if (input instanceof URL) {
      if (input.origin === window.location.origin && shouldRewrite(input.pathname)) {
        return nativeFetch(rewrite(input.pathname + input.search + input.hash), init);
      }
      return nativeFetch(input, init);
    }
    const reqUrl = new URL(input.url, window.location.origin);
    if (reqUrl.origin === window.location.origin && shouldRewrite(reqUrl.pathname)) {
      const next = new Request(rewrite(reqUrl.pathname + reqUrl.search + reqUrl.hash), input);
      return nativeFetch(next, init);
    }
    return nativeFetch(input, init);
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
