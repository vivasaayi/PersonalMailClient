import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function () { return ({
    plugins: [react()],
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true
    },
    preview: {
        port: 1420,
        strictPort: true
    },
    build: {
        outDir: "dist",
        target: ["es2020"],
        chunkSizeWarningLimit: 600
    }
}); });
