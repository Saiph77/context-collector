# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`cc-ts` is a TypeScript + Electron reimplementation of the `cc-py` Context Collector app — a macOS-only floating panel triggered by double Cmd+C that captures clipboard text into Markdown files. The spec target is 1:1 behavioral parity with `cc-py`; no new product features.

## Commands

### Build & Run
```bash
npm run start:fresh   # Kill old processes, install, build native, build TS, and launch (recommended)
npm run build         # Build main (tsc) + renderer (esbuild)
npm run native:build  # Rebuild the N-API native addon (required after node/electron version changes)
npm run start         # Build and start Electron
```

### Testing & Development
```bash
npm test              # Run unit tests with vitest
npm run dev:test      # Run integration tests (requires agent server)
npm run dev:demo      # Run streaming demo
npm run dev:server    # Start agent server

# Or use the dev script directly
./scripts/dev.sh test    # Integration tests
./scripts/dev.sh demo    # Streaming demo
./scripts/dev.sh server  # Start agent server
./scripts/dev.sh help    # Show help
```

Run a single test file:
```bash
npx vitest run tests/unit/storage.test.ts
```

After any native addon change, rebuild before testing:
```bash
npm run native:build && npm run build && electron .
```

**Accessibility permission** must be granted to Electron in System Preferences > Privacy & Security > Accessibility for the global hotkey to work.

## Architecture

### Process Model

```
Main process (src/main/)
  ├── main.ts              — bootstrap, single-instance lock, IPC wiring, signal handlers
  ├── hotkey-controller.ts — pure state machine: double Cmd+C (400ms), open debounce (350ms)
  ├── window-controller.ts — BrowserWindow lifecycle, overlay promotion, cursor-relative positioning
  ├── native-bridge.ts     — EventEmitter wrapping the N-API addon; resolves addon from multiple paths
  ├── storage.ts           — file naming, sanitization, conflict resolution (-a/-b suffix)
  └── position.ts          — window centering + screen boundary clamping

Preload (src/preload/index.ts)
  └── contextBridge exposes `window.ccApi` — the only IPC surface to the renderer

Renderer (src/renderer/, built with esbuild)
  └── React app: Title input, content textarea, Save/Close buttons, "Last saved" label

Native addon (native/cc_native_bridge/src/cc_native_bridge.mm)
  └── Objective-C++ N-API module: CGEventTap listener on background thread,
      prepareOverlayMode (sets NSApp activation policy to .accessory before first show),
      promoteToOverlay (applies collectionBehavior fallback chain, CGShieldingWindowLevel+1)
```

### Key Behavioral Constraints (must not drift)

| Parameter | Value |
|---|---|
| Double Cmd+C threshold | 400 ms |
| Open debounce | 350 ms |
| Keycodes | C=8, S=1, W=13 |
| Window size | 860×520 |
| Save path | `tmp_projects/demo-temp/YYYY-MM-DD/HH-mm_<title>.md` |
| Conflict suffix | `-a`, `-b` … `-z`, `-z1`, `-z2` … |

### Overlay Promotion Order (critical for fullscreen Space stability)

The native bridge tries `collectionBehavior` in this exact fallback order — **do not mix or reorder**:
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

### Build Pipeline

- **Main/Preload**: `tsc` compiles `src/main/**` and `src/preload/**` → `dist/` (CommonJS, ES2022)
- **Renderer**: `esbuild` bundles `src/renderer/app.tsx` → `dist/renderer/app.js`; HTML/CSS are copied verbatim
- **Native addon**: `electron-rebuild` compiles `cc_native_bridge.mm` via `binding.gyp` using node-gyp

### Tests

Unit tests live in `tests/unit/` and cover:
- `storage.test.ts` — title sanitization, path building, conflict suffixes
- `hotkey-controller.test.ts` — double-tap state machine, debounce logic
- `window-position.test.ts` — centering algorithm, screen boundary clamping

Tests use `vitest` with `environment: node`; no Electron or DOM globals available in unit tests.
