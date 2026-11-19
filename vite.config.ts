import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Vite blocks requests with an unrecognized Host header by default (DNS
    // rebinding protection). A Cloudflare quick tunnel forwards the public
    // *.trycloudflare.com hostname straight through, so it gets rejected
    // with 403 unless explicitly allowed. Dev-only, never ships in a build.
    allowedHosts: [".trycloudflare.com"],
  },
  // `server.allowedHosts` does not apply to `vite preview`, which is what
  // serves the built widget bundle over the tunnel.
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
  define: {
    // Define process.env as an empty object to avoid needing window.process
    "process.env": {},
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/widget.tsx"),
      name: "ReactWidget",
      fileName: "react-widget-uv",
      formats: ["iife"],
    },
    rollupOptions: {
      // Remove external dependencies to bundle them
      // external: ['react', 'react-dom'],
      output: {
        // Remove globals mapping since React and ReactDOM will be bundled
        // globals: {
        //   react: 'React',
        //   'react-dom': 'ReactDOM',
        // },
      },
    },
  },
});
