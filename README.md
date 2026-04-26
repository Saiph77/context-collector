# Context Collector

TypeScript and Electron app for **macOS** that captures clipboard text into Markdown, with a native overlay and optional screenshot + LongCat-based vision (see `docs/plan/`).

## Quick start

```bash
npm install
npm run start:fresh
```

- Grant **Accessibility** to the built Electron app in System Settings → Privacy & Security → Accessibility (required for the global double **⌘C** hotkey).
- Optional vision features need the Python `agent_kernel` service and a configured LongCat API key; see `agent_kernel/README.md` and `start-vision.sh`.

## Repository layout

| Path | Purpose |
|------|---------|
| `src/main`, `src/renderer`, `src/preload` | Electron app |
| `native/cc_native_bridge` | N-API helper (hotkey, overlay) |
| `agent_kernel` | Local Flask + streaming agent / vision API |
| `sample` | Small LongCat / multimodal examples |
| `docs` | Design notes and plans |
| `CLAUDE.md` | Developer / agent context |

## License

Project license is defined by the repository owner; see repository metadata if a `LICENSE` file is added.
