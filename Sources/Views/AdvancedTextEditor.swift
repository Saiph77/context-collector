import SwiftUI
import AppKit

// 自定义 NSTextView 子类处理全局快捷键
class CustomTextView: NSTextView {
    weak var coordinator: AdvancedTextEditor.Coordinator?
    
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard let coordinator = coordinator else {
            return super.performKeyEquivalent(with: event)
        }
        
        let modifierFlags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let keyCode = event.charactersIgnoringModifiers?.lowercased() ?? ""
        
        // 处理 Cmd+B (加粗)
        if modifierFlags == .command && keyCode == "b" {
            coordinator.toggleBold(self)
            return true
        }
        
        // 处理 Cmd+Z (撤销)
        if modifierFlags == .command && keyCode == "z" {
            coordinator.undo(self)
            return true
        }
        
        // 处理 Cmd+Shift+Z (重做)
        if modifierFlags == [.command, .shift] && keyCode == "z" {
            coordinator.redo(self)
            return true
        }
        
        return super.performKeyEquivalent(with: event)
    }
}

struct AdvancedTextEditor: NSViewRepresentable {
    @Binding var text: String
    var onBoldToggle: (() -> Void)?
    
    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        
        // 创建自定义 TextView 替换默认的
        let customTextView = CustomTextView()
        customTextView.coordinator = context.coordinator
        scrollView.documentView = customTextView
        
        let textView = customTextView
        
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.string = text
        
        // 启用撤销功能
        textView.allowsUndo = true
        
        // 添加快捷键处理 - 使用 NSTextView 的内置机制
        textView.menu = createContextMenu(for: textView, coordinator: context.coordinator)
        
        // 为 coordinator 设置 textView 引用，用于快捷键处理
        context.coordinator.textView = textView
        
        return scrollView
    }
    
    func updateNSView(_ nsView: NSScrollView, context: Context) {
        let textView = nsView.documentView as! NSTextView
        if textView.string != text {
            textView.string = text
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    private func createContextMenu(for textView: NSTextView, coordinator: Coordinator) -> NSMenu {
        let menu = NSMenu()
        
        let boldItem = NSMenuItem(title: "粗体 (⌘B)", action: #selector(Coordinator.toggleBold), keyEquivalent: "b")
        boldItem.keyEquivalentModifierMask = .command
        boldItem.target = coordinator  // 修正：指向正确的 Coordinator 实例
        menu.addItem(boldItem)
        
        // 添加撤销/重做菜单项
        menu.addItem(NSMenuItem.separator())
        
        let undoItem = NSMenuItem(title: "撤销 (⌘Z)", action: #selector(Coordinator.undo(_:)), keyEquivalent: "z")
        undoItem.keyEquivalentModifierMask = NSEvent.ModifierFlags.command
        undoItem.target = coordinator
        menu.addItem(undoItem)
        
        let redoItem = NSMenuItem(title: "重做 (⌘⇧Z)", action: #selector(Coordinator.redo(_:)), keyEquivalent: "z")
        redoItem.keyEquivalentModifierMask = [NSEvent.ModifierFlags.command, NSEvent.ModifierFlags.shift]
        redoItem.target = coordinator
        menu.addItem(redoItem)
        
        return menu
    }
    
    class Coordinator: NSObject, NSTextViewDelegate {
        let parent: AdvancedTextEditor
        weak var textView: NSTextView?
        
        init(_ parent: AdvancedTextEditor) {
            self.parent = parent
        }
        
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
        }
        
        @objc func toggleBold(_ sender: AnyObject) {
            // 使用保存的 textView 引用
            guard let textView = self.textView else { return }
            
            let selectedRange = textView.selectedRange()
            let fullText = textView.string
            let startIndex = fullText.index(fullText.startIndex, offsetBy: selectedRange.location)
            let endIndex = fullText.index(startIndex, offsetBy: selectedRange.length)
            let selectedText = String(fullText[startIndex..<endIndex])
            
            if selectedText.isEmpty {
                // 没有选中文本，插入模板
                let insertText = "**粗体文本**"
                textView.insertText(insertText, replacementRange: selectedRange)
                
                // 选中"粗体文本"部分
                let newRange = NSRange(location: selectedRange.location + 2, length: 4)
                textView.setSelectedRange(newRange)
            } else {
                // 有选中文本，添加粗体标记
                let boldText = "**\(selectedText)**"
                textView.insertText(boldText, replacementRange: selectedRange)
                
                // 重新选中加粗后的文本
                let newRange = NSRange(location: selectedRange.location, length: boldText.count)
                textView.setSelectedRange(newRange)
            }
            
            parent.text = textView.string
        }
        
        @objc func undo(_ sender: AnyObject) {
            guard let textView = self.textView else { return }
            textView.undoManager?.undo()
            parent.text = textView.string
        }
        
        @objc func redo(_ sender: AnyObject) {
            guard let textView = self.textView else { return }
            textView.undoManager?.redo()
            parent.text = textView.string
        }
    }
}