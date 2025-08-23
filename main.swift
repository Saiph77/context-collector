import SwiftUI
import AppKit

// 主应用程序类
class ContextCollectorApp: NSApplication {
    private let hotkeyService = HotkeyService()
    private let windowManager = CaptureWindowManager()
    
    override func finishLaunching() {
        super.finishLaunching()
        
        print("🚀 Context Collector 启动")
        
        // 设置应用为后台运行（菜单栏应用）
        setActivationPolicy(.accessory)
        
        // 设置全局快捷键回调
        hotkeyService.onDoubleCmdC = { [weak self] in
            print("🎯 触发双击 Cmd+C 回调")
            self?.handleDoubleCmdC()
        }
        
        // 启动全局快捷键监听
        if hotkeyService.startListening() {
            print("✅ 全局快捷键监听已启动")
            showStartupMessage()
        } else {
            print("❌ 全局快捷键监听启动失败")
            showPermissionAlert()
        }
    }
    
    private func handleDoubleCmdC() {
        print("🎉 处理双击 Cmd+C 事件")
        
        // 显示捕获窗口
        DispatchQueue.main.async { [weak self] in
            self?.windowManager.showCaptureWindow()
        }
    }
    
    private func showStartupMessage() {
        print("""
        
        =======================================
        🎉 Context Collector 已准备就绪!
        =======================================
        
        使用方法:
        1. 在任意应用中复制文本 (Cmd+C)
        2. 快速再按一次 Cmd+C (间隔 < 0.4秒)
        3. 编辑窗口将自动弹出
        4. 编辑完成后按 Cmd+S 保存
        
        应用正在后台运行...
        按 Ctrl+C 可退出应用
        =======================================
        
        """)
    }
    
    private func showPermissionAlert() {
        let alert = NSAlert()
        alert.messageText = "需要辅助功能权限"
        alert.informativeText = """
        Context Collector 需要辅助功能权限来监听全局快捷键。
        
        请在系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能中，
        允许 Context Collector 访问您的电脑。
        
        设置完成后请重启应用。
        """
        alert.alertStyle = .warning
        alert.addButton(withTitle: "打开系统偏好设置")
        alert.addButton(withTitle: "稍后设置")
        
        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            // 打开系统偏好设置
            let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
            NSWorkspace.shared.open(url)
        }
        
        // 退出应用
        NSApp.terminate(nil)
    }
    
    override func terminate(_ sender: Any?) {
        print("👋 Context Collector 退出")
        hotkeyService.stopListening()
        super.terminate(sender)
    }
}

// 应用程序委托
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        print("✅ 应用程序启动完成")
    }
    
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // 不要因为窗口关闭而退出应用
        return false
    }
    
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // 当用户点击 Dock 图标时的行为
        return true
    }
}

// 程序入口点
print("=== Context Collector 启动 ===")

// 设置测试剪贴板内容（便于测试）
ClipboardService.simulateClipboardContent()

let app = ContextCollectorApp.shared
let delegate = AppDelegate()

app.delegate = delegate

print("🔧 启动应用程序...")

// 添加 Ctrl+C 退出处理
signal(SIGINT) { _ in
    print("\n👋 收到退出信号，正在关闭...")
    DispatchQueue.main.async {
        NSApp.terminate(nil)
    }
}

// 运行应用程序
app.run()