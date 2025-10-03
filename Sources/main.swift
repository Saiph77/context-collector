#!/usr/bin/env swift

import SwiftUI
import AppKit
import CoreGraphics

// MARK: - 程序入口
print("=== Context Collector 启动 ===")

// 构建服务容器（保持不可变引用）
let services = ServiceContainer(
    clipboard: ClipboardService(),
    storage: StorageService(),
    hotkey: HotkeyService(),
    preferences: PreferencesService()
)

// MARK: - 应用程序委托
class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowManager: WindowManager!

    func applicationDidFinishLaunching(_ notification: Notification) {
        print("🚀 Context Collector 启动")

        NSApp.setActivationPolicy(.regular)

        // 初始化窗口管理器
        self.windowManager = WindowManager(services: services)

        // 设置快捷键回调
        services.hotkey.onDoubleCmdC = { [weak self] in
            print("🎯 触发双击 Cmd+C")
            DispatchQueue.main.async {
                self?.windowManager.showCaptureWindow()
            }
        }

        // 启动快捷键监听
        if services.hotkey.startListening() {
            print("✅ 快捷键监听已启动")
            self.showStartupMessage()
        } else {
            print("❌ 快捷键监听启动失败，需要辅助功能权限")
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            self.windowManager.showCaptureWindow()
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        print("👋 Context Collector 退出")
        services.hotkey.stopListening()
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
}

// 启动应用
let app = NSApplication.shared
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
