import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/gauge/',
  server: {
    proxy: {
      '/dav': {
        target: 'https://webdav.example.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
