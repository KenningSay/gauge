# Gauge

**A fast, keyboard-first file manager for your own WebDAV server.**

Built and actually run against a raw nginx `dav` module; Nextcloud/ownCloud/Synology should work for browsing and file ops but have a known gap on rename/move/copy specifically (see [Pointing it at your WebDAV server](#pointing-it-at-your-webdav-server)) until someone tests against one for real. No backend of its own, no database, no account with a third party: Gauge is a static web app that talks straight from your browser to your own server. Your files never touch anyone else's infrastructure.

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
- [Boards](#boards)
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

## Boards

A second tab next to the file manager: an infinite canvas you drop things onto. It stores everything as plain JSON on the same WebDAV server — no extra service, no database.

- **Pins**: notes (markdown, colour, paper texture, opacity), images, video and audio, arbitrary files, and links (rendered as an iframe once you click into them, a favicon card otherwise)
- **Notes come in two kinds**, the same split Obsidian Canvas draws: a plain note owns its text inside the board file, while a *linked* note is a view onto a real `.md` in your vault — it renders that file, and editing it on the board writes the file back. Right-click empty space for "Заметка из хранилища (.md)…" to place one, or right-click an existing note to save it into the vault and link it from then on. A badge on the pin shows which file it's bound to
- Selection is a hairline outline that follows the pin's own shape, with round corner handles; both are divided by the canvas zoom so they stay crisp at any scale
- **Shapes**: rectangle, ellipse, diamond, triangle — each can hold markdown text, a picture from the vault clipped to its outline, or nothing at all (a plain frame drawn around a group of pins)
- **Connections**: every pin grows four ports on hover; drag one onto another pin to join them with a curve. The wire re-anchors to the nearest sides as you move cards around, follows them live during a drag, and `Delete` removes a selected one
- Drag by the body or the tab on top, resize from eight handles, marquee-select with `Alt`+drag, right-click for layering/duplicate/colour/delete
- Editing follows the convention every board tool shares: select a pin and press `Enter`, or just start typing and the first character lands in the text; `Esc` leaves the editor and keeps the selection. Double-click still works. A note you just created opens for typing straight away
- **Undo/redo** (`Ctrl Z` / `Ctrl Shift Z`) over an unbounded op-log, persisted with the board — closing the tab doesn't reset your history
- Drop files from your OS to copy them into the board's own assets folder; drag them in from the file manager tab to *reference* the vault file instead of duplicating it
- Autosave, debounced, with a save indicator. If the board changed elsewhere since you loaded it, the save is refused and you're asked whether to overwrite or reload — it never silently clobbers another device's edits
- Dropping a pin onto occupied space pushes the neighbours out of the way, chain-reaction style
- Four built-in templates, plus "save this board as a template"

### AI (DeepSeek, optional)

A chat panel lives inside the boards tab, and pin right-click menus grow an **AI** submenu (improve/fix/shorten/expand text, summarize, find connections, tag). Answers land back on the board as notes, or rewrite the note you ran them on.

The chat sees the board — every pin's text plus its position and size — so "what's on this board?" and "tidy this up" are answerable questions. It can also change the board: ask it to write some notes and they appear, ask it to arrange things and the pins move (as one step, so `Ctrl Z` puts them back). It does this by ending a reply with a fenced `gauge:notes` or `gauge:layout` block that the app executes and hides; ids that don't exist and coordinates that aren't finite are discarded rather than trusted.

Two ways to reach DeepSeek:

- **Server-side proxy (recommended, and the default).** Set `DEEPSEEK_API_KEY` on the container; nginx injects the `Authorization` header at `/ai/`. The key never reaches the browser. **Protect that endpoint** — it spends your balance and the shipped template doesn't authenticate it. Gauge forwards the browser's WebDAV credential on every `/ai/` request for exactly this reason, so if the same server also hosts your WebDAV share, put its `auth_basic` on `/ai/` too and strangers get a 401.
- **Direct endpoint (fallback).** Put `https://api.deepseek.com` in the panel's settings and your key alongside it. The key is kept in `sessionStorage` (gone when the tab closes) and never written to disk — but **this requires editing the CSP**: `connect-src 'self'` in `nginx.conf.template` blocks the request before CORS is even considered, so add `https://api.deepseek.com` there.

Board data lives under `.gauge/` at the root of your WebDAV share (`boards-index/` for the board files, histories and chats; `boards/<id>/assets/` for uploaded pin files). Delete that folder and boards are gone — nothing else in the app depends on it. Don't create a `.gauge` folder by hand.

Known limits: the audio pin shows cover art and a play button but the global player isn't built yet; there's no in-board search; and assets referenced by a *user-saved template* are not copied into boards created from it, so deleting the template breaks those pins.

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

**Put this behind HTTPS before exposing it to anything but `localhost`.** The container itself serves plain HTTP — your WebDAV password goes over Basic Auth, which is only as safe as the connection it travels on. Terminate TLS with whatever you already use in front of self-hosted containers (Caddy, Traefik, nginx-proxy, a cloud load balancer, …); this image doesn't bundle a certificate itself, the same way most single-purpose containers don't.

## Pointing it at your WebDAV server

`WEBDAV_TARGET` must be the **full URL** your server actually serves WebDAV at, including its real path — not just the bare domain. Gauge's own requests always go to `/dav/...` on whatever domain it's served from; nginx rewrites that prefix to your real target, so the app itself never needs to know what your server's path looks like.

| Backend | Typical `WEBDAV_TARGET` |
| --- | --- |
| Raw nginx `dav` module | `https://host/dav/` |
| Nextcloud | `https://host/remote.php/dav/files/<username>/` |
| ownCloud | `https://host/remote.php/webdav/` |
| Synology DSM (WebDAV Server package) | `https://host:5006/` |

**Known gap for anything other than a raw nginx `dav` module:** rename, move, and copy send a WebDAV `Destination` header built as `/dav/<path>` — correct for the one backend this project has actually been developed and tested against, where `/dav/` genuinely is nginx's own WebDAV root. `proxy_pass` rewrites the *request URI's* `/dav/` prefix to your real `WEBDAV_TARGET`, but it does not rewrite header *values* — so on Nextcloud/ownCloud/Synology, that `Destination` header still says `/dav/...` once it reaches your real server, which has no idea what `/dav/` is supposed to mean. Expect rename/move/copy specifically to fail against those backends until this gets a proper fix (translating `Destination` server-side, most likely). Browsing, upload, download, and delete don't use `Destination` and aren't affected. If you hit this and want to help nail down the fix, open an issue — it needs testing against a real Nextcloud/ownCloud/Synology instance, which this project doesn't have access to.

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

Directory rename/move/copy/delete use native WebDAV `MOVE`/`COPY`/`DELETE` on the whole collection in a single request — not a recursive per-file walk — so they're atomic and fast regardless of how many files are inside. Image/PDF previews and downloads fetch the actual bytes with a real `Authorization` header and hand the browser a `blob:` URL; credentials never end up sitting in a URL, a `src` attribute, or anywhere else in the DOM. Video/audio playback goes through a small service worker (`public/gauge-sw.js`) instead, so `<video>`/`<audio>` get a real streamable URL with working seek (HTTP Range) rather than downloading the whole file into memory first — the worker injects the `Authorization` header on the fly, asking the page for it fresh on every request rather than storing it anywhere, so there's nothing sitting on disk for it to leak.

Your username and password are entered once on Gauge's own login screen and kept only in `sessionStorage` — cleared the moment the tab closes, never written into the build, never sent anywhere but your own WebDAV server. Nothing durable (IndexedDB, `localStorage`, cookies) ever holds a copy, including on the service worker's side of things — verified directly (`indexedDB.databases()` stays empty for the whole session).

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
- Login validates against your real WebDAV server (a live `PROPFIND`), then keeps credentials in `sessionStorage` only — not `localStorage`, not a cookie, not IndexedDB (see the service worker note above — it asks the page for the header live rather than caching it anywhere).
- All programmatic requests use a real `Authorization` header. Media/downloads that historically needed a credentialed URL (because `<img>`/`<video>`/`<audio>` tags can't carry a custom header) now fetch through a real header into a `blob:` URL (or the service worker, for video/audio) instead — nothing credential-shaped ever touches a URL.
- `Overwrite: F` is set on every `MOVE`/`COPY`, so renaming or pasting onto an existing name fails loudly instead of silently clobbering it.
- Folder/file names are validated against path-traversal segments (`.`, `..`) before ever reaching a request — both at the input point and, independently, inside the one function that turns any path into a request URL, so a stray `..` can't be encoded/normalized into escaping `/dav/` onto another path on the same origin.
- A 401 from the server (revoked credentials, expired session) drops the app back to the login screen immediately, instead of leaving a half-authenticated UI up with every subsequent request failing silently.

- The DeepSeek key, in the recommended proxy setup, lives only in the container's environment and is attached by nginx — the browser never sees it. In direct mode it follows the same rule as the WebDAV credential: `sessionStorage`, never disk.

Found something that looks like a real security issue? Open an issue — this is a young project and a second pair of eyes is always welcome.

## License

[MIT](LICENSE) — do what you want with it, just keep the license notice.
