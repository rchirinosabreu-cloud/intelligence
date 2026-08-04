import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'node:child_process'

const buildSha = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'development' } })()

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(buildSha) },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
