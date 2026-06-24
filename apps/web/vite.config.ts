import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { normalizeApiBase } from './src/lib/normalize-api-base';

const parseAllowedHosts = (raw: string | undefined): true | string[] => {
  const list = String(raw ?? '')
    .split(',')
    .map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  return list.length ? list : true;
};

const resolveAllowedHosts = (env: Record<string, string>): true | string[] => {
  // loadEnv only reads .env files — merge process.env for Railway/runtime injection.
  const fromEnv = process.env.VITE_ALLOWED_HOSTS ?? env.VITE_ALLOWED_HOSTS;
  if (fromEnv?.trim()) return parseAllowedHosts(fromEnv);

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (process.env.RAILWAY_ENVIRONMENT || railwayDomain) {
    return railwayDomain ? [railwayDomain, '.up.railway.app'] : true;
  }

  return true;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || 'http://localhost:14000';
  const allowedHosts = resolveAllowedHosts(env);
  const apiBaseUrl = normalizeApiBase(process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? '');

  return {
    base: env.VITE_BASE_URL || process.env.VITE_BASE_URL || '/',
    server: {
      port: Number(env.VITE_PORT || 13509),
      host: '0.0.0.0',
      allowedHosts,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/storage': { target: apiTarget, changeOrigin: true }
      }
    },
    preview: {
      port: Number(process.env.PORT || env.VITE_PORT || 13509),
      host: '0.0.0.0',
      allowedHosts,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    },
    build: {
      chunkSizeWarningLimit: 3000
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@modules': path.resolve(__dirname, '..', '..', 'modules'),
        // Modules occasionally pull a shared UI piece (e.g. FileManager) from the web app.
        // Expose it via this alias so the coupling is explicit instead of brittle ../../../ paths.
        '@webapp': path.resolve(__dirname, 'src')
      }
    }
  };
});
