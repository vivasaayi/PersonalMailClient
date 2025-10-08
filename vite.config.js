import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function () { return ({
    plugins: [react()],
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: false
    },
    preview: {
        port: 5173,
        strictPort: false
    },
    build: {
        outDir: "dist",
        target: ["es2020"],
        chunkSizeWarningLimit: 600
    }
}); });
