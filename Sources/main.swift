#!/usr/bin/env swift

import SwiftUI
import AppKit

// MARK: - 窗口管理器
class WindowManager: ObservableObject {
    private var window: NSWindow?
    
    
    func showCaptureWindow() {
        print("🪟 显示捕获窗口")
        
        if window != nil {
            window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let captureView = CaptureWindow(
            onClose: { [weak self] in
                self?.hideCaptureWindow()
            },
            onMinimize: { [weak self] in
                self?.minimizeCaptureWindow()
            }
        )
        
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 500),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        
        window?.title = "Context Collector"
        window?.contentView = NSHostingView(rootView: captureView)
        window?.level = .popUpMenu
        window?.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window?.makeKeyAndOrderFront(nil)
        
        NSApp.activate(ignoringOtherApps: true)
        
        // 延迟定位，确保窗口完全显示后再进行定位
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.positionWindowNearMouse()
        }
        
        print("✅ 捕获窗口已显示")
    }
    
    func hideCaptureWindow() {
        print("🙈 隐藏捕获窗口")
        window?.orderOut(nil)
        window = nil
    }
    
    func minimizeCaptureWindow() {
        print("⬇️ 最小化捕获窗口")
        window?.miniaturize(nil)
    }
    
    private func positionWindowNearMouse() {
        guard let window = window else { return }
        
        // 调试信息收集
        debugScreenInfo()
        
        // 获取当前鼠标位置
        let mouseLocation = NSEvent.mouseLocation
        print("🖱️ 鼠标位置: \(mouseLocation)")
        
        // 使用遍历方法找到包含鼠标的屏幕（优先使用frame，更可靠）
        var currentScreen: NSScreen?
        for screen in NSScreen.screens {
            if screen.frame.contains(mouseLocation) {
                currentScreen = screen
                break
            }
        }
        // 回退到主屏幕
        if currentScreen == nil {
            currentScreen = NSScreen.main ?? NSScreen.screens.first!
        }
        
        print("🖥️ 检测到的屏幕: \(currentScreen?.visibleFrame ?? NSRect.zero)")
        print("🖥️ 主屏幕对比: \(NSScreen.main?.visibleFrame ?? NSRect.zero)")
        
        // 确保有有效屏幕
        guard let screen = currentScreen else {
            print("❌ 无法获取有效屏幕")
            return
        }
        
        // 窗口尺寸
        let windowSize = window.frame.size
        
        // 使用检测到的屏幕的可见区域进行定位
        let screenFrame = screen.visibleFrame
        
        // 考虑Retina屏幕的缩放因子来调整偏移量
        let scaleFactor = screen.backingScaleFactor
        let baseOffset: CGFloat = 20
        let offset = baseOffset / scaleFactor  // Retina屏幕需要更小的逻辑偏移
        
        // 计算目标位置（鼠标右下方偏移）
        var targetX = mouseLocation.x + offset
        var targetY = mouseLocation.y - windowSize.height - offset
        
        print("🔍 缩放因子: \(scaleFactor), 调整后偏移: \(offset)")
        
        // 边界检测 - X轴
        if targetX + windowSize.width > screenFrame.maxX {
            // 如果右侧超出边界，放到鼠标左侧
            targetX = mouseLocation.x - windowSize.width - offset
        }
        if targetX < screenFrame.minX {
            // 如果左侧也超出，就居中到当前屏幕
            targetX = screenFrame.midX - windowSize.width / 2
        }
        
        // 边界检测 - Y轴
        if targetY < screenFrame.minY {
            // 如果下方超出边界，放到鼠标上方
            targetY = mouseLocation.y + offset
        }
        if targetY + windowSize.height > screenFrame.maxY {
            // 如果上方也超出，就居中到当前屏幕
            targetY = screenFrame.midY - windowSize.height / 2
        }
        
        let targetFrame = NSRect(x: targetX, y: targetY, width: windowSize.width, height: windowSize.height)
        window.setFrame(targetFrame, display: true)
        
        print("✅ 窗口定位到: \(targetFrame)")
        print("📍 是否在检测屏幕内: \(screenFrame.intersects(targetFrame))")
    }
    
    private func debugScreenInfo() {
        print("=== 屏幕调试信息 ===")
        let mouseLocation = NSEvent.mouseLocation
        print("🖱️ 鼠标位置: \(mouseLocation)")
        
        if let mainScreen = NSScreen.main {
            print("🖥️ 主屏幕:")
            print("  frame: \(mainScreen.frame)")
            print("  visibleFrame: \(mainScreen.visibleFrame)")
            print("  backingScaleFactor: \(mainScreen.backingScaleFactor)")
        }
        
        print("📺 所有屏幕:")
        for (index, screen) in NSScreen.screens.enumerated() {
            let isMain = screen == NSScreen.main
            let containsFrame = screen.frame.contains(mouseLocation)
            let containsVisible = screen.visibleFrame.contains(mouseLocation)
            print("  屏幕 \(index) \(isMain ? "(主屏幕)" : ""):")
            print("    frame: \(screen.frame)")
            print("    visibleFrame: \(screen.visibleFrame)")
            print("    backingScaleFactor: \(screen.backingScaleFactor)")
            print("    包含鼠标(frame): \(containsFrame)")
            print("    包含鼠标(visible): \(containsVisible)")
        }
        
        // 测试遍历检测方法
        var detectedScreen: NSScreen?
        for screen in NSScreen.screens {
            if screen.frame.contains(mouseLocation) {
                detectedScreen = screen
                break
            }
        }
        if let screen = detectedScreen {
            print("🎯 遍历检测结果:")
            print("  frame: \(screen.frame)")
            print("  visibleFrame: \(screen.visibleFrame)")
            print("  是否为主屏幕: \(screen == NSScreen.main)")
        } else {
            print("🎯 遍历检测：未找到包含鼠标的屏幕")
        }
        
        print("==================")
    }
}

// MARK: - 主应用程序
class ContextCollectorApp: NSApplication {
    let windowManager = WindowManager()
    
    override func finishLaunching() {
        super.finishLaunching()
        
        print("🚀 Context Collector 启动")
        
        setActivationPolicy(.regular)
        
        // 设置快捷键回调
        HotkeyService.shared.onDoubleCmdC = { [weak self] in
            print("🎯 触发双击 Cmd+C")
            DispatchQueue.main.async {
                self?.windowManager.showCaptureWindow()
            }
        }
        
        // 启动快捷键监听
        if HotkeyService.shared.startListening() {
            print("✅ 快捷键监听已启动")
            showStartupMessage()
        } else {
            print("❌ 快捷键监听启动失败，需要辅助功能权限")
        }
    }
    
    private func showStartupMessage() {
        print("""
        
        ========================================
        🎉 Context Collector 已准备就绪!
        ========================================
        
        快捷键:
        • 双击 Cmd+C - 唤起窗口并读取剪贴板
        • Cmd+S - 保存并关闭
        • Cmd+B - 插入/包围粗体格式
        
        使用方法:
        1. 复制文本到剪贴板或直接双击 Cmd+C 唤起
        2. 选择/创建项目并编辑内容
        3. 选中文本后按 Cmd+B 进行加粗
        4. 使用 Cmd+S 保存，或点击Dock图标重新打开
        
        应用正在后台运行...
        ========================================
        
        """)
    }
    
    override func terminate(_ sender: Any?) {
        print("👋 Context Collector 退出")
        HotkeyService.shared.stopListening()
        super.terminate(sender)
    }
}

// MARK: - 应用程序委托  
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }
    
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // 当用户点击Dock图标时触发
        if !flag {
            // 没有可见窗口时，显示捕获窗口
            if let contextApp = sender as? ContextCollectorApp {
                contextApp.windowManager.showCaptureWindow()
            }
        }
        return true
    }
}

// MARK: - 程序入口
print("=== Context Collector 启动 ===")

// 应用启动时不设置测试内容，直接读取用户的真实剪贴板内容

let app = ContextCollectorApp.shared
let delegate = AppDelegate()
app.delegate = delegate

// 信号处理
signal(SIGINT) { _ in
    print("\n👋 收到退出信号")
    DispatchQueue.main.async {
        NSApp.terminate(nil)
    }
}

app.run()