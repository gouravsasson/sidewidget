import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Define process.env as an empty object to avoid needing window.process
    "process.env": {},
    // Lib mode doesn't replace process.env.NODE_ENV, so without this the
    // IIFE ships React's development build: StrictMode double-runs every
    // effect (duplicate API calls) and dev-only warnings print on customer sites.
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
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
}));
