import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Marketing landing page for the Sinapsis ecosystem. Static site — no API
// dependency — but kept as an independent service in the monorepo so it can be
// deployed on its own port like the PWAs.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.VITE_PORT || 13512);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port,
      allowedHosts: true
    },
    preview: {
      host: "0.0.0.0",
      port,
      allowedHosts: true
    }
  };
});
