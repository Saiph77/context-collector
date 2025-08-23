#!/usr/bin/env swift

import SwiftUI
import AppKit
import CoreGraphics


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