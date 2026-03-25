# Repository Guidelines

## Project Structure & Module Organization
- `Sources/main.swift`: app entrypoint, lifecycle setup, and hotkey wiring.
- `Sources/Core/Protocols/`: service contracts (`*ServiceType`) used for dependency injection.
- `Sources/Infrastructure/DI/ServiceContainer.swift`: composes runtime services.
- `Sources/Views/`: SwiftUI/AppKit UI and interaction logic (capture window, editor, project picker).
- Root files: `build.sh` (build pipeline), `README.md` (user guide), `CLAUDE.md` (developer context).
- Build output is `Context Collector.app/`; treat it as generated artifact.

## Build, Test, and Development Commands
- `./build.sh` — compiles Swift sources with `swiftc`, rebuilds `Context Collector.app`, and writes `Info.plist`.
- `open "Context Collector.app"` — launches the app for local verification.
- `./build.sh && open "Context Collector.app"` — common edit-build-run loop.

## Coding Style & Naming Conventions
- Follow existing Swift style: 4-space indentation, clear `// MARK:` sections, focused files.
- Use `UpperCamelCase` for types, `lowerCamelCase` for properties/functions, and `is/has` prefixes for booleans.
- Keep protocol naming consistent with current pattern: `ClipboardServiceType`, `StorageServiceType`.
- When adding source files, update `build.sh` compile order (protocols first, then implementations, views, then `main.swift`).

## Testing Guidelines
- There is currently no automated `Tests/` target.
- Minimum manual smoke test after changes:
  1. Run `./build.sh` without errors.
  2. Launch app and verify double `Cmd+C` opens capture window.
  3. Verify `Cmd+S` writes a Markdown file under `~/ContextCollector/...`.
  4. Re-check focus/navigation behavior in fullscreen and multi-Space scenarios.
- If you add automated tests, place them under `Tests/` using XCTest and name files as `<Feature>NameTests.swift`.

## Commit & Pull Request Guidelines
- Keep commits single-purpose and readable; project history accepts either concise summaries or conventional style like `fix(spaces): ...`.
- PRs should include: what changed, why, manual test steps/results, and UI evidence (screenshots/video) for window/focus behavior changes.
- Link related issues and call out permission or macOS behavior impacts explicitly.

## Security & Configuration Tips
- This app depends on Accessibility and AppleEvents permissions; verify permission flows after rebuilds.
- Do not commit personal capture data or generated app artifacts unless release packaging is intentional.
