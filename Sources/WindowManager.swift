import SwiftUI
import AppKit
import CoreGraphics

// MARK: - 窗口管理器
class WindowManager: ObservableObject {
    private let services: ServiceContainer
    private var window: NSPanel?

    init(services: ServiceContainer) {
        self.services = services
    }
    
    func showCaptureWindow() {
        print("🪟 显示捕获窗口")
        
        // 1) 显示前切到 accessory（Agent）以允许覆盖他人全屏 Space
        NSApp.setActivationPolicy(.accessory)  // 关键一步（可在关闭时切回）
        
        if let w = window {
            w.orderFrontRegardless()
            // 强制激活窗口并获得焦点
            w.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            
            // 验证已存在窗口的激活状态
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                let isKey = w.isKeyWindow
                let appActive = NSApp.isActive
                print("🔍 已存在窗口激活验证: isKey=\(isKey), appActive=\(appActive)")
                
                if !isKey || !appActive {
                    print("⚠️ 已存在窗口激活不完整，重试")
                    w.makeKeyAndOrderFront(nil)
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
            return
        }
        
        let captureView = CaptureWindow(
            services: services,
            onClose: { [weak self] afterSave in self?.hideCaptureWindow(afterSave: afterSave) },
            onMinimize: { [weak self] in self?.minimizeCaptureWindow() }
        )
        let targetFrame = calculateWindowPosition()
        let panel = makeCapturePanel(frame: targetFrame,
                                     content: NSHostingView(rootView: captureView))
        panel.title = "Context Collector"

        // 2) 显示并激活窗口
        panel.orderFrontRegardless()
        panel.makeKeyAndOrderFront(nil)
        
        // 激活应用程序并获得焦点
        NSApp.activate(ignoringOtherApps: true)
        
        self.window = panel

        // 3) 验证窗口激活状态
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            let isKey = panel.isKeyWindow
            let isMain = panel.isMainWindow
            let appActive = NSApp.isActive
            print("🔍 窗口激活验证: isKey=\(isKey), isMain=\(isMain), appActive=\(appActive)")
            
            if !isKey || !appActive {
                print("⚠️ 窗口激活不完整，重试激活")
                panel.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            } else {
                print("✅ 捕获窗口已完全激活")
            }
        }
    }
    
    func hideCaptureWindow(afterSave: Bool) {
        print("🙈 隐藏捕获窗口 afterSave=\(afterSave)")
        window?.orderOut(nil)
        window = nil

        if afterSave {
            // 保存后不切回 .regular，避免跨 Space 抢焦点
            NSApp.deactivate()
            // 保持 .accessory，防止 Dock/主窗口被激活
        } else {
            // 非保存关闭（如取消/手动关闭）保留原行为
            NSApp.setActivationPolicy(.regular)
        }
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
        let panel = ActivatablePanel(
            contentRect: frame,
            styleMask: [.titled, .closable], // 移除nonactivatingPanel，让窗口可以被激活
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
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

// MARK: - 可激活的面板
class ActivatablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}