import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// API em http://localhost:3333 (api). O front chama sempre /api/... (mesma origem).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: process.env.API_URL || "http://localhost:3333", changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { "/api": { target: process.env.API_URL || "http://localhost:3333", changeOrigin: true } },
  },
})
