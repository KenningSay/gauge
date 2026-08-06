import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/gauge/',
  server: {
    proxy: {
      '/dav': {
        target: 'https://hcj08ezrs1p.sn.mynetname.net',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
