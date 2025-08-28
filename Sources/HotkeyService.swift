import Foundation
import AppKit
import Carbon

final class HotkeyService: HotkeyServiceType {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var lastCmdCTime: TimeInterval = 0
    private let doubleTapThreshold: TimeInterval = 0.4
    
    var onDoubleCmdC: (() -> Void)?

    init() {}
    
    func startListening() -> Bool {
        guard checkAccessibilityPermission() else {
            print("❌ 需要辅助功能权限")
            return false
        }
        
        let eventMask = (1 << CGEventType.keyDown.rawValue)
        
        eventTap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
                guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
                let hotkeyService = Unmanaged<HotkeyService>.fromOpaque(refcon).takeUnretainedValue()
                return hotkeyService.handleKeyEvent(proxy: proxy, type: type, event: event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        )
        
        guard let eventTap = eventTap else {
            print("❌ 无法创建事件监听")
            return false
        }
        
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: eventTap, enable: true)
        
        print("✅ 快捷键监听已启动")
        return true
    }
    
    func stopListening() {
        if let eventTap = eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: false)
            CFMachPortInvalidate(eventTap)
            self.eventTap = nil
        }
        
        if let runLoopSource = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
            self.runLoopSource = nil
        }
        
        print("🛑 快捷键监听已停止")
    }
    
    private func handleKeyEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        guard type == .keyDown else {
            return Unmanaged.passUnretained(event)
        }
        
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        
        // 检测 Cmd+C (keyCode 8 = C)
        if keyCode == 8 && flags.contains(.maskCommand) {
            handleCmdC()
        }
        
        return Unmanaged.passUnretained(event)
    }
    
    private func handleCmdC() {
        let currentTime = Date().timeIntervalSince1970
        
        if currentTime - lastCmdCTime <= doubleTapThreshold {
            print("🎉 检测到双击 Cmd+C")
            
            DispatchQueue.main.async {
                self.onDoubleCmdC?()
            }
            
            lastCmdCTime = 0
        } else {
            lastCmdCTime = currentTime
        }
    }
    
    
    private func checkAccessibilityPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): false]
        return AXIsProcessTrustedWithOptions(options as CFDictionary)
    }
}
