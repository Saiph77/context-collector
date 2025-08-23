# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Context Collector is a lightweight macOS native app for quick text collection and editing using SwiftUI + AppKit. It captures clipboard content via global hotkeys and provides simple Markdown editing features.

## Build Commands

### Build the Application
```bash
./build.sh
```
This script compiles all Swift files and creates a complete app bundle with proper Info.plist configuration.

### Launch the Built App
```bash
open "Context Collector.app"
```

### Manual Compilation (if needed)
```bash
swiftc -o "Context Collector.app/Contents/MacOS/ContextCollector" \
    Sources/ClipboardService.swift \
    Sources/StorageService.swift \
    Sources/HotkeyService.swift \
    Sources/Views/AdvancedTextEditor.swift \
    Sources/Views/ProjectComponents.swift \
    Sources/Views/NewProjectDialog.swift \
    Sources/Views/CaptureWindow.swift \
    Sources/main.swift
```

## Architecture Overview

### Core Services Architecture
- **HotkeyService**: Global keyboard event monitoring using CGEventTap, requires Accessibility permissions
- **ClipboardService**: NSPasteboard wrapper for reading clipboard text content
- **StorageService**: File system management with atomic writes and project organization
- **WindowManager**: NSWindow lifecycle management for the capture interface

### UI Components
- **CaptureWindow**: Main interface with project selector (left) and text editor (right)
- **AdvancedTextEditor**: NSTextView wrapper with Markdown shortcuts (⌘B for bold, ⌘/ for comments)
- **ProjectComponents**: Project selection UI components
- **NewProjectDialog**: Modal for creating new projects

### Key Implementation Details

#### Mixed SwiftUI + AppKit Integration
- Uses NSViewRepresentable to embed NSTextView in SwiftUI
- Critical: Do not replace NSTextView's documentView as it breaks SwiftUI bindings
- Global hotkey detection requires CGEventTap with Accessibility permissions

#### File Organization System
```
~/ContextCollector/
├── inbox/YYYY-MM-DD/
└── projects/{project}/YYYY-MM-DD/
```
- Files named as `HH-mm_title.md`
- Automatic conflict resolution with `-a`, `-b` suffixes
- Atomic writes to prevent data corruption

#### Global Hotkey Implementation
- Double ⌘C detection within 400ms window
- Uses NSEvent.addLocalMonitorForEvents for app-specific shortcuts
- CGEventTap for system-wide double-tap detection

## Required Permissions

The app requires these macOS permissions (configured in Info.plist):
- **NSAccessibilityUsageDescription**: For global hotkey monitoring
- **NSAppleEventsUsageDescription**: For clipboard access

## Development Patterns

### Error-Prone Areas
1. **Text Binding Issues**: Avoid replacing NSTextView instances in NSViewRepresentable
2. **Permission Handling**: Always check and gracefully handle denied Accessibility permissions
3. **Event Scope**: Distinguish between global (CGEventTap) vs app-local (NSEvent) keyboard monitoring

### Service Dependencies
- StorageService is stateless and thread-safe
- HotkeyService runs on background thread but callbacks execute on main queue
- All UI updates must happen on main thread

### Common Debugging Steps
1. Check Accessibility permissions in System Preferences
2. Verify file permissions for ~/ContextCollector directory
3. Monitor console output for service initialization status
4. Test clipboard content before assuming it contains text

## Key Features

### Keyboard Shortcuts
- Double ⌘C: Trigger capture window
- ⌘B: Toggle bold formatting on selected text
- ⌘/: Toggle line comments
- ⌘S: Save and close
- Esc: Close window

### File Naming Rules
- Invalid characters `\/:*?"<>|` replaced with `-`
- Empty titles default to "untitled"
- Automatic timestamp prefix in HH-mm format
- Conflict resolution with alphabetical suffixes

## Testing Scenarios

### Critical Test Cases
- Double ⌘C detection timing (< 400ms window)
- Text wrapping/unwrapping for bold and comments
- File save with special characters in title
- Permission denied graceful handling
- Clipboard empty/non-text content handling

### Integration Points
- NSTextView ↔ SwiftUI binding synchronization
- Global event monitoring ↔ app window focus
- File system operations ↔ UI state updates