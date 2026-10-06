import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'node:child_process'

// Nombre de la versión. En Railway la compilación no recibe el commit ni tiene git, y todas las
// versiones salían como «development» (registro de Elisa, 6 de octubre de 2026): la recuperación
// por versión y los registros de error no podían distinguir una de otra. Una compilación sin
// commit se nombra con su hora; «development» queda solo para el servidor de desarrollo.
const isBuild = process.argv.includes('build')
const buildSha = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } })()
  || (isBuild ? `build-${Date.now().toString(36)}` : 'development')

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
