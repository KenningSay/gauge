# Gauge

A fast, keyboard-first file manager for your own WebDAV server — Nextcloud, ownCloud, a raw nginx `dav` module, anything that speaks WebDAV. Runs entirely in your browser; your files never pass through a third-party backend, only straight from your browser to your own WebDAV server.

- Two-pane layout with a folder tree, list/grid views, sortable columns
- Built-in viewers: images (zoom/pan), video, audio, text (editable), Markdown (rendered), PDF
- Full keyboard navigation — arrows, Enter, Backspace, `F2` rename, `Ctrl+K` command palette with vault-wide search
- Copy / Cut / Paste / Duplicate (`Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D`), drag-and-drop upload (including whole folders), drag-to-move
- Upload progress, live cross-device updates via polling, mobile-friendly (long-press multi-select, swipe-friendly layout)
- Its own login screen — no browser Basic-Auth popup, no credentials ever hardcoded into the build

## Quick start (Docker)

Clone this repo, then either:

```
docker build -t gauge .
docker run -d -p 8080:80 -e WEBDAV_TARGET=https://your-webdav-server.example.com/dav/ --name gauge gauge
```

or with `docker-compose.yml` (edit `WEBDAV_TARGET` in it first):

```
docker compose up -d
```

Open `http://localhost:8080` and log in with your WebDAV username/password — that's it, nothing else to configure.

**`WEBDAV_TARGET`** must be the full URL your WebDAV server actually serves WebDAV at, not just the bare domain. For a raw nginx `dav` module that's often just `https://host/dav/`; for Nextcloud it's typically `https://host/remote.php/dav/files/<username>/`. Gauge's own requests always go to `/dav/...` on whatever domain it's served from — nginx rewrites that prefix to your real `WEBDAV_TARGET` (see `nginx.conf.template`), so Gauge itself never needs to know your server's actual path.

## How it talks to your WebDAV server

Gauge is a static single-page app with no backend of its own — every file operation (list, upload, download, rename, move, copy, delete) is a real WebDAV request (`PROPFIND`/`PUT`/`GET`/`MOVE`/`COPY`/`DELETE`/`MKCOL`) sent straight from your browser. The bundled nginx just serves the static files and reverse-proxies `/dav/` to your real server so the browser doesn't need to deal with CORS or a second TLS cert. Your username/password are entered on Gauge's own login screen, kept only in `sessionStorage` (cleared when the tab closes), and never written into the build or a URL.

## Development

```
npm install
cp .env.local.example .env.local   # point VITE_DEV_WEBDAV_TARGET at your own WebDAV server
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload, proxies `/dav` to `VITE_DEV_WEBDAV_TARGET` from `.env.local` |
| `npm run build` | Type-checks (`tsc -b`) then produces a production build in `dist/` |
| `npm run lint` | Runs `oxlint` |
| `npm run preview` | Serves the production build locally |

## Stack

React + TypeScript + Vite, Zustand for state, `lucide-react` icons, `react-markdown` + `remark-gfm` for the Markdown viewer. No backend, no database — WebDAV *is* the backend.
