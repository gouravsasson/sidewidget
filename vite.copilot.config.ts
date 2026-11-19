// Build of the Shopify admin copilot pages (copilot.html, embedded; and
// copilot-voice.html, the top-level voice page), kept apart from the IIFE
// widget build in vite.config.ts. Output: dist-copilot/, deployed with
// vercel.copilot.json.
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  if (command === "build" && !loadEnv(mode, process.cwd(), "VITE_").VITE_SHOPIFY_API_KEY) {
    throw new Error("VITE_SHOPIFY_API_KEY must be set: App Bridge reads it from copilot.html");
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    build: {
      outDir: "dist-copilot",
      rollupOptions: {
        input: {
          copilot: path.resolve(__dirname, "copilot.html"),
          voice: path.resolve(__dirname, "copilot-voice.html"),
        },
      },
    },
  };
});
