import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageAssets = fileURLToPath(
  new URL("../../packages/whatijustdid/assets", import.meta.url),
);

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: packageAssets,
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL("whatijustdid.html", import.meta.url)),
      output: {
        entryFileNames: "whatijustdid.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith(".css"))
            ? "whatijustdid.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});
