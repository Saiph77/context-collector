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
## 开发经验教训

### 🔥 关键避坑指南

#### **绝不替换NSView实例**
```swift
// ❌ 致命错误：破坏SwiftUI数据绑定
let customTextView = CustomTextView()
scrollView.documentView = customTextView

// ✅ 正确做法：保持原实例，使用事件监听
let textView = scrollView.documentView as! NSTextView
NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in ... }
```

#### **权限声明必须完整**
Info.plist中两个权限缺一不可：
- `NSAccessibilityUsageDescription` - 全局快捷键监听
- `NSAppleEventsUsageDescription` - 剪贴板访问

#### **NSMenuItem的keyEquivalent误区**
`NSMenuItem.keyEquivalent`只在右键菜单中生效，不是全局快捷键。全局快捷键需要NSEvent监听。

### 🎯 macOS系统级开发核心技术

#### **窗口跨Space显示的唯一可靠方案**
```swift
// 核心技术栈：NSPanel + Accessory + CGShieldingWindowLevel
NSApp.setActivationPolicy(.accessory)  // 关键：允许覆盖全屏Space
let panel = NSPanel(styleMask: [.nonactivatingPanel, .titled, .closable])
panel.collectionBehavior = [.canJoinAllSpaces, .stationary]
panel.level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)
```

#### **权限管理复杂性**
- 每次重编译后macOS认为是"新应用"，需重新授权
- 开发流程：删除旧权限条目 → 重新添加.app → 确认权限生效
- 使用AXIsProcessTrustedWithOptions检查权限状态

#### **激活策略的系统级影响**
- `.regular`：正常应用，有Dock图标，无法覆盖全屏Space
- `.accessory`：辅助应用，可显示在其他应用的全屏Space上
- `.agent`：完全后台，无界面交互能力

### 🧠 问题分析方法论

#### **从表象到本质的分析框架**
1. **现象识别**：窗口只在Space 1显示，误认为多屏问题
2. **本质分析**：实际是Mission Control Spaces的窗口隔离机制
3. **技术验证**：普通NSWindow被全屏Space隔离，需要特殊方案
4. **方案实施**：NSPanel + Accessory策略突破限制

#### **系统性调试步骤**
```
问题出现 → 权限检查 → 绑定验证 → 事件传递追踪 → API限制分析
```

#### **功能冲突诊断模式**
- 新功能单独测试 ✓
- 原功能修改前测试 ✓
- 逐步回滚定位冲突点
- 寻找不破坏原功能的替代方案

### 🏗️ 架构设计最佳实践

#### **混合架构的事件处理原则**
- **分层处理**：局部处理 + 全局兜底
- **精确过滤**：使用window和firstResponder精确过滤事件
- **避免冲突**：统一焦点管理策略，避免多套系统冲突

#### **模块化重构策略**
- 单文件超过300行立即重构
- 按组件职责拆分，保持功能完全不变
- 每次只重构一个组件，立即测试
- 使用git保存关键节点

#### **外部专家指导的关键价值**
- **技术方向纠偏**：避免在错误路径上浪费时间
- **成熟方案提供**：基于社区最佳实践的可靠技术栈
- **系统性知识补充**：macOS底层机制的深度理解

### 📊 技术决策备忘

#### **何时选择NSPanel而非NSWindow**
- 需要跨Space显示：NSPanel ✓
- 需要浮动效果：NSPanel ✓
- 需要正常Dock图标：NSWindow ✓
- 需要标准窗口行为：NSWindow ✓

#### **CGShieldingWindowLevel vs 标准层级**
- `.screenSaver` (1000)：标准最高层级
- `CGShieldingWindowLevel() + 1`：真正的最高层级，用于跨Space显示

#### **成功项目技术参考**
从Rectangle、Hammerspoon等成功项目学习：
- NSPanel + Accessory是跨Space显示的标准方案
- 动态激活策略切换保持用户体验
- 避免私有API，使用公开API组合

### ⚡ 开发效率提升

#### **问题解决优先级**
1. **优先咨询专家**：系统级问题的专业经验价值巨大
2. **研究成功案例**：开源项目是最好的学习资源
3. **建立完整调试流程**：权限→绑定→事件→API限制的系统检查

#### **版本控制最佳实践**
- 功能节点必须提交：权限修复、架构重构、问题解决
- 提交信息格式：问题描述 + 根本原因 + 解决方案
- 保持可回滚到任何稳定版本的能力
