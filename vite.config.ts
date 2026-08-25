import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' (relative), not a hardcoded '/gauge/' — the old value only ever
// worked for one specific deployment (this author's own, served under that
// exact subpath). A relative base works whether the built dist/ ends up at
// a domain root or behind a reverse proxy under any subpath, with nothing
// to edit per-deployment. Production WebDAV routing lives entirely in the
// Docker image's nginx.conf.template (WEBDAV_TARGET env var), not here —
// this file's proxy only ever runs under `npm run dev`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: './',
    server: {
      proxy: {
        '/dav': {
          // VITE_DEV_WEBDAV_TARGET in .env.local (gitignored, see
          // .env.local.example) — was hardcoded to the original author's
          // own WebDAV domain, which meant `npm run dev` only ever worked
          // out of the box for them, not for anyone else who clones this.
          target: env.VITE_DEV_WEBDAV_TARGET || 'http://localhost',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
