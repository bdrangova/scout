import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports are fixed by the contract: API on 4545, web on 4546 (see shared/README.md). `WEB_PORT` and
// `API_PORT` override them so the e2e run can start its own pair next to a running dev setup.
const webPort = Number(process.env.WEB_PORT ?? 4546)
const apiPort = Number(process.env.API_PORT ?? 4545)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // mermaid is lazy-imported by @streamdown/mermaid; pre-bundle it so the first diagram does not 504.
  optimizeDeps: {
    include: ['mermaid'],
  },
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
  },
})
