import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.API_URL || 'http://localhost:4000'

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'API_'],
    server: {
      proxy: {
        '/api': apiUrl,
        '/ads-catalog': apiUrl,
        '/manifest': apiUrl,
        '/segments': apiUrl,
      },
    },
  }
})
