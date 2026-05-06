# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

macOS-only floating panel triggered by double Cmd+C that captures clipboard text into Markdown files. Behavioral parity with the original Python app is the spec target; no new product features.

## Commands

### Build & Run
```bash
npm run start:fresh   # Kill old processes, install, build native, build TS, launch (recommended)
npm run build         # Build main (tsc) + renderer (esbuild)
npm run native:build  # Rebuild N-API native addon (required after node/electron version changes)
npm run start         # Build and start Electron
```

### Vision / Agent Server (required for most workflows)
```bash
./start-vision.sh            # Start Electron + agent_kernel Flask server with vision enabled
./scripts/dev.sh server      # Start agent server only
curl http://127.0.0.1:5678/health   # Health check
```
Set `LONGCAT_API_KEY` before running vision features. Server port: `AGENT_SERVER_PORT` (default 5678).

### Testing
```bash
npm test                                           # Unit tests (vitest)
npx vitest run tests/unit/storage.test.ts          # Single test file
npm run dev:test                                   # Integration tests (requires agent server)
```

## Architecture

### Process Model
```
Main process (src/main/)          — bootstrap, IPC, hotkey/window/storage controllers
Preload (src/preload/index.ts)    — contextBridge: window.ccApi (only IPC surface to renderer)
Renderer (src/renderer/)          — 3 React apps: main panel, screenshot-bar, chat-dialog
Native addon (native/cc_native_bridge/)  — CGEventTap, prepareOverlayMode, promoteToOverlay
agent_kernel/                     — Flask + streaming agent server (Python)
```

### Behavioral Constants (must not drift)
| Parameter | Value |
|---|---|
| Double Cmd+C threshold | 400 ms |
| Open debounce | 350 ms |
| Keycodes | C=8, S=1, W=13 |
| Window size | 860×520 |
| Save path | `tmp_projects/demo-temp/YYYY-MM-DD/HH-mm_<title>.md` |
| Conflict suffix | `-a`, `-b` … `-z`, `-z1`, `-z2` … |

### Overlay Promotion Order (critical — do not reorder)
Fallback chain in `native-bridge.ts`:
1. `MoveToActiveSpace | Stationary | FullScreenAuxiliary`
2. `MoveToActiveSpace | FullScreenAuxiliary`
3. `CanJoinAllSpaces | Stationary | FullScreenAuxiliary`

`prepareOverlayMode` must be called **before** the first `win.show()` to prevent the first-launch Space jump.

### IPC Channels
| Channel | Direction | Purpose |
|---|---|---|
| `panel:present` | main → renderer | Load clipboard text, reset title |
| `panel:focus-title` | main → renderer | Select-all on title input |
| `panel:saved` | main → renderer | Show "Last saved: …" path |
| `panel:state-update` | renderer → main | Sync title + content on change |
| `panel:request-save` | renderer → main | Trigger save-and-hide |
| `panel:request-close` | renderer → main | Trigger hide |

## Build Pipeline Notes

- **Main/Preload**: `tsc` → `dist/` (CommonJS, ES2022). Renderer `.tsx` files are **not** in tsconfig — esbuild handles them.
- **Renderer**: esbuild bundles 3 separate IIFE apps (Chrome 120 target); HTML/CSS copied verbatim.
- **Native addon**: `postinstall` auto-runs `native:build`. If node-gyp fails on Python 3.12+, set `PYTHON=/usr/bin/python3`.
- After any native addon change: `npm run native:build && npm run build && electron .`

## Tests

Unit tests in `tests/unit/`; `environment: node` — no Electron or DOM globals available. Vitest clears mocks between tests automatically.

## Code Style

Prettier config (`config/.prettierrc`): single quotes, trailing commas on all multi-line structures, 100-char line width. ESLint allows `console.log`.

## Accessibility Permission

Grant Electron access in **System Settings > Privacy & Security > Accessibility** for the global hotkey to work.
