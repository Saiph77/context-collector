import SwiftUI
import AppKit
import CoreGraphics

// MARK: - 窗口管理器
class WindowManager: ObservableObject {
    private var window: NSPanel?
    
    func showCaptureWindow() {
        print("🪟 显示捕获窗口")
        
        // 1) 显示前切到 accessory（Agent）以允许覆盖他人全屏 Space
        NSApp.setActivationPolicy(.accessory)  // 关键一步（可在关闭时切回）
        
        if let w = window {
            w.orderFrontRegardless()           // 面板用这个更稳定
            return
        }
        
        let captureView = CaptureWindow(
            onClose: { [weak self] in self?.hideCaptureWindow() },
            onMinimize: { [weak self] in self?.minimizeCaptureWindow() }
        )
        let targetFrame = calculateWindowPosition()
        let panel = makeCapturePanel(frame: targetFrame,
                                     content: NSHostingView(rootView: captureView))
        panel.title = "Context Collector"

        // 2) 直接前置到最前，无需激活其他 App
        panel.orderFrontRegardless()
        self.window = panel

        // 保持应用不抢前台，但如果你希望高亮一下菜单栏图标，可按需 NSApp.activate(...)
        print("✅ 捕获窗口已显示（Accessory + Panel + ShieldLevel）")
    }
    
    func hideCaptureWindow() {
        print("🙈 隐藏捕获窗口")
        window?.orderOut(nil)
        window = nil

        // 3) 关闭后切回常规，以恢复 Dock 图标/常规行为（如果你希望一直是后台工具，也可不切回）
        NSApp.setActivationPolicy(.regular)
    }
    
    func minimizeCaptureWindow() {
        print("⬇️ 最小化捕获窗口")
        window?.miniaturize(nil)
    }
    
    private func calculateWindowPosition() -> NSRect {
        // 获取当前鼠标位置
        let mouseLocation = NSEvent.mouseLocation
        print("🖱️ 计算窗口位置 - 鼠标位置: \(mouseLocation)")
        
        // 检测鼠标所在屏幕
        var currentScreen: NSScreen?
        for screen in NSScreen.screens {
            if screen.frame.contains(mouseLocation) {
                currentScreen = screen
                break
            }
        }
        if currentScreen == nil {
            currentScreen = NSScreen.main ?? NSScreen.screens.first!
        }
        
        let screen = currentScreen!
        let screenFrame = screen.visibleFrame
        let scaleFactor = screen.backingScaleFactor
        let baseOffset: CGFloat = 20
        let offset = baseOffset / scaleFactor
        
        // 窗口尺寸
        let windowSize = NSSize(width: 800, height: 500)
        
        // 计算目标位置（鼠标右下方偏移）
        var targetX = mouseLocation.x + offset
        var targetY = mouseLocation.y - windowSize.height - offset
        
        // 边界检测 - X轴
        if targetX + windowSize.width > screenFrame.maxX {
            targetX = mouseLocation.x - windowSize.width - offset
        }
        if targetX < screenFrame.minX {
            targetX = screenFrame.midX - windowSize.width / 2
        }
        
        // 边界检测 - Y轴
        if targetY < screenFrame.minY {
            targetY = mouseLocation.y + offset
        }
        if targetY + windowSize.height > screenFrame.maxY {
            targetY = screenFrame.midY - windowSize.height / 2
        }
        
        let targetFrame = NSRect(x: targetX, y: targetY, width: windowSize.width, height: windowSize.height)
        print("✅ 计算出窗口位置: \(targetFrame)")
        
        return targetFrame
    }
    
    private func makeCapturePanel(frame: NSRect, content: NSView) -> NSPanel {
        let panel = NSPanel(
            contentRect: frame,
            styleMask: [.nonactivatingPanel, .titled, .closable], // 非激活 + 可关闭标题栏
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true   // 需要交互时可成为 key
        panel.worksWhenModal = true
        panel.contentView = content

        // 加入所有 Spaces，且不随 Mission Control 切换位置抖动
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary]

        // 关键：更高的窗口层级。优先尝试"屏蔽层级+1"，失败则回退到 screenSaver
        let shield = Int(CGShieldingWindowLevel())
        if shield > 0 {
            panel.level = NSWindow.Level(rawValue: shield + 1)
        } else {
            panel.level = .screenSaver
        }
        return panel
    }
}