import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Independent service inside the Sinapsis monorepo. Runs on its own port and
// proxies /api and /storage to the Sinapsis API (default :14000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:14000";
  const port = Number(env.VITE_PORT || 13510);

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port,
      allowedHosts: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/storage": { target: apiTarget, changeOrigin: true }
      }
    },
    preview: {
      host: "0.0.0.0",
      port,
      allowedHosts: true
    }
  };
});
