# Gauge

**A fast, keyboard-first file manager for your own WebDAV server.**

Nextcloud, ownCloud, a raw nginx `dav` module — anything that speaks WebDAV. No backend of its own, no database, no account with a third party: Gauge is a static web app that talks straight from your browser to your own server. Your files never touch anyone else's infrastructure.

[![License: MIT](https://img.shields.io/badge/license-MIT-2dd4bf.svg)](LICENSE)
![React](https://img.shields.io/badge/react-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-8-646cff?logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ed?logo=docker&logoColor=white)

🇷🇺 **По-русски:** быстрый файловый менеджер для своего WebDAV-сервера (Nextcloud, ownCloud, nginx `dav`) — работает прямо из браузера, без стороннего бэкенда и без чужого аккаунта поверх. Логин/пароль вводятся только на экране входа и никогда никуда не пишутся. Ставится в один `docker run`, см. [Quick start](#quick-start-docker).

---

## Contents

- [Why](#why)
- [Features](#features)
- [Quick start (Docker)](#quick-start-docker)
- [Pointing it at your WebDAV server](#pointing-it-at-your-webdav-server)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Supported file types](#supported-file-types)
- [How it works](#how-it-works)
- [Development](#development)
- [Security notes](#security-notes)
- [License](#license)

## Why

Most WebDAV clients are either a clunky OS-level network drive or a paid cloud dashboard that wants its own account on top of the one you already have. Gauge is neither: point it at a WebDAV endpoint you already control, log in with the credentials that endpoint already has, and get a real file manager UI — not a folder window, not a upsell screen.

## Features

**Browsing & viewing**
- Two-pane layout — folder tree + list/grid view, sortable by name, size, modified date, type
- Built-in viewers: images (zoom/pan), video, audio, PDF, plain text (editable, saves back), **Markdown rendered as a live preview**
- Global search (`Ctrl K`) across the whole vault, not just the current folder

**File operations**
- Upload via button or drag-and-drop — including whole folders, recursively
- **Upload progress** — live byte/file counters, not just a spinner
- Copy / Cut / Paste / Duplicate, with auto-renaming on collision (`file.txt` → `file (копия).txt` → `(копия 2)` …)
- Drag-and-drop move (onto a folder row or the sidebar tree), inline rename, create folder, delete
- Multi-select (`Ctrl`/`Shift`-click, long-press on touch) with bulk copy/cut/delete in the toolbar

**Built to actually be used daily**
- Its own login screen — no browser Basic-Auth popup, and nothing you type is ever baked into the app or put in a URL
- Live cross-device updates (polls in the background, only re-renders when something actually changed)
- Mobile-responsive: slide-in folder tree, touch multi-select, kebab menus, a bottom-safe layout — not just a squeezed desktop view
- Dark/light theme, keyboard navigation throughout, a command palette for everything

## Quick start (Docker)

Clone the repo, then either:

```bash
docker build -t gauge .
docker run -d -p 8080:80 \
  -e WEBDAV_TARGET=https://your-webdav-server.example.com/dav/ \
  --name gauge gauge
```

or with `docker-compose.yml` (edit `WEBDAV_TARGET` in it first):

```bash
docker compose up -d
```

Open `http://localhost:8080`, log in with your WebDAV username and password — that's the whole setup.

## Pointing it at your WebDAV server

`WEBDAV_TARGET` must be the **full URL** your server actually serves WebDAV at, including its real path — not just the bare domain. Gauge's own requests always go to `/dav/...` on whatever domain it's served from; nginx rewrites that prefix to your real target, so the app itself never needs to know what your server's path looks like.

| Backend | Typical `WEBDAV_TARGET` |
| --- | --- |
| Raw nginx `dav` module | `https://host/dav/` |
| Nextcloud | `https://host/remote.php/dav/files/<username>/` |
| ownCloud | `https://host/remote.php/webdav/` |
| Synology DSM (WebDAV Server package) | `https://host:5006/` |

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl K` | Open command palette / search |
| `Ctrl I` | Toggle properties panel |
| `Ctrl A` | Select all |
| `Ctrl C` / `Ctrl X` / `Ctrl V` | Copy / cut / paste |
| `Ctrl D` | Duplicate |
| `F2` | Rename |
| `Delete` | Delete selection |
| `↑` / `↓` | Move selection cursor |
| `Enter` | Open folder / file |
| `Backspace` | Go up one level |
| `Esc` | Clear selection (or close whatever's open) |

Inside the viewer: `←`/`→` to move between files, `Esc` to close. Inside a rename: `Enter` to confirm, `Esc` to cancel. `Ctrl`/`Cmd` is used interchangeably — both work on every platform.

## Supported file types

| Kind | Extensions |
| --- | --- |
| Image | `png` `jpg` `jpeg` `gif` `webp` `svg` `bmp` `avif` |
| Video | `mp4` `webm` `ogv` `mov` `mkv` |
| Audio | `mp3` `wav` `ogg` `flac` `m4a` |
| PDF | `pdf` |
| Text / code (editable) | `md` `txt` `json` `js` `ts` `tsx` `css` `html` `xml` `yml` `toml` `ini` `sh` `py` `log` `csv` … and anything else the server reports as `text/*` |

Markdown files get a rendered preview by default, with a toggle to edit the raw source. Anything else falls back to a plain download button — nothing is ever silently unsupported.

## How it works

Gauge is a static single-page app with **no backend of its own**. Every file operation — list, upload, download, rename, move, copy, delete — is a real WebDAV request (`PROPFIND` / `PUT` / `GET` / `MOVE` / `COPY` / `DELETE` / `MKCOL`) sent straight from your browser. The bundled nginx only serves the static files and reverse-proxies `/dav/` to your real server, so the browser doesn't have to deal with CORS or a second TLS certificate.

Directory rename/move/copy/delete use native WebDAV `MOVE`/`COPY`/`DELETE` on the whole collection in a single request — not a recursive per-file walk — so they're atomic and fast regardless of how many files are inside. Media previews and downloads fetch the actual bytes with a real `Authorization` header and hand the browser a `blob:` URL; credentials never end up sitting in a URL, a `src` attribute, or anywhere else in the DOM.

Your username and password are entered once on Gauge's own login screen and kept only in `sessionStorage` — cleared the moment the tab closes, never written into the build, never sent anywhere but your own WebDAV server.

## Development

```bash
npm install
cp .env.local.example .env.local   # point VITE_DEV_WEBDAV_TARGET at your own WebDAV server
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload, proxies `/dav` to `VITE_DEV_WEBDAV_TARGET` |
| `npm run build` | Type-checks (`tsc -b`), then builds `dist/` |
| `npm run lint` | Runs `oxlint` |
| `npm run preview` | Serves the production build locally |

**Stack:** React 19 + TypeScript + Vite, Zustand for state (a few small stores — files/selection/navigation, UI chrome, auth session), `lucide-react` icons, `react-markdown` + `remark-gfm` for the Markdown viewer. No backend, no database — WebDAV *is* the backend.

## Security notes

- No credentials are ever hardcoded into the bundle — verified by grepping the built `dist/` output.
- Login validates against your real WebDAV server (a live `PROPFIND`), then keeps credentials in `sessionStorage` only — not `localStorage`, not a cookie.
- All programmatic requests use a real `Authorization` header. Media/downloads that historically needed a credentialed URL (because `<img>`/`<video>`/`<audio>` tags can't carry a custom header) now fetch through a real header into a `blob:` URL instead — nothing credential-shaped ever touches a URL.
- `Overwrite: F` is set on every `MOVE`/`COPY`, so renaming or pasting onto an existing name fails loudly instead of silently clobbering it.

Found something that looks like a real security issue? Open an issue — this is a young project and a second pair of eyes is always welcome.

## License

[MIT](LICENSE) — do what you want with it, just keep the license notice.
