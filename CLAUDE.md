# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Context Collector is a lightweight macOS native app for quick text collection and editing using SwiftUI + AppKit. It captures clipboard content via global hotkeys and provides Markdown editing features. No Xcode project — compiled directly with `swiftc`.

## Build Commands

```bash
./build.sh          # Build the app bundle
open "Context Collector.app"  # Launch
```

After every recompile, macOS treats it as a new app — **re-grant Accessibility permission** in System Preferences > Privacy & Security > Accessibility (delete old entry, add new `.app`).

## Architecture

### Dependency Injection via ServiceContainer

`Sources/Infrastructure/DI/ServiceContainer.swift` holds all services. Constructed in `main.swift` and injected into `WindowManager`, which passes them into `CaptureWindow`. All services are abstracted by protocols in `Sources/Core/Protocols/`.

```
main.swift
  └─ ServiceContainer { clipboard, storage, hotkey, preferences }
       └─ WindowManager(services:)
            └─ CaptureWindow(clipboardService:, storageService:)
```

### Core Services

- **HotkeyService**: CGEventTap-based global hotkey monitoring. Runs on background thread; `onDoubleCmdC` callback dispatches to main queue. Double ⌘C within 400ms triggers `WindowManager.showCaptureWindow()`.
- **ClipboardService**: NSPasteboard wrapper.
- **StorageService**: Atomic file writes to `~/ContextCollector/`. Files: `HH-mm_title.md`. Projects under `projects/{name}/YYYY-MM-DD/`, inbox under `inbox/YYYY-MM-DD/`. Persists last-selected project.
- **PreferencesService**: Stub — `loadPreferences`/`savePreferences` are TODOs.

### Window Management

`WindowManager` uses **NSPanel** (not NSWindow) with `ActivatablePanel` subclass. Key panel config:
```swift
NSApp.setActivationPolicy(.accessory)          // allows overlay on fullscreen Spaces
panel.collectionBehavior = [.canJoinAllSpaces, .stationary]
panel.level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)
```
On save-close: stays `.accessory` and calls `NSApp.deactivate()`. On cancel-close: reverts to `.regular`. Window is positioned near the mouse cursor with screen-boundary clamping.

### UI Layout (CaptureWindow)

Left panel: `ProjectSelectionView` — project list with keyboard navigation via `KeyboardNavigationManager`.
Right panel: title (`TitleField`), content (`AdvancedTextEditor`), save/cancel buttons.

Arrow key routing: when `isTitleFocused || !isContentEditorFocused` → project navigation; when `isContentEditorFocused` → pass to NSTextView for cursor movement.

### AdvancedTextEditor (NSViewRepresentable)

Wraps `NSTextView` inside `NSScrollView`. **Never replace `scrollView.documentView`** — it breaks SwiftUI bindings. Instead, keep the original NSTextView instance and attach event monitors:

```swift
// ✅ Correct
let textView = scrollView.documentView as! NSTextView
NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in ... }
```

Keyboard shortcuts handled via `NSEvent.addLocalMonitorForEvents` (not `NSMenuItem.keyEquivalent`, which only works in context menus). Handled: ⌘B (bold wrap/insert), ⌘Z/⌘⇧Z (undo/redo), ⌘A (select all). Focus state synced via `NSTextViewDelegate` + `NotificationCenter` observers for `didChangeSelection` and window key notifications.

## File Compilation Order

`build.sh` compiles files in dependency order — protocols first, then implementations, then views, then `main.swift`. When adding new files, insert them in the correct position in `build.sh`.

## Required Permissions (Info.plist)

Both keys are required:
- `NSAccessibilityUsageDescription` — global hotkey via CGEventTap
- `NSAppleEventsUsageDescription` — clipboard access

`LSUIElement = true` hides the app from the Dock by default; activation policy is managed dynamically at runtime.

## Keyboard Shortcuts

- Double ⌘C: Open capture window (global)
- ⌘B: Toggle bold (`**text**`) on selection or insert template
- ⌘S: Save and close (`.keyboardShortcut` on SwiftUI button)
- ⌘Z / ⌘⇧Z: Undo / Redo
- ↑↓: Navigate projects (when not in content editor)
- Esc / ❌ button: Close without saving
