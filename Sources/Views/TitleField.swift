import SwiftUI
import AppKit

struct TitleField: NSViewRepresentable {
    @Binding var text: String
    @Binding var isFocused: Bool
    var onArrowUp: () -> Void
    var onArrowDown: () -> Void

    func makeNSView(context: Context) -> NSTextField {
        let tf = NSTextField(string: text)
        tf.isEditable = true
        tf.isSelectable = true
        tf.isBordered = true
        tf.isBezeled = true            // 基本外观，避免样式分歧
        tf.focusRingType = .default
        tf.usesSingleLineMode = true
        tf.lineBreakMode = .byTruncatingTail
        tf.cell?.wraps = false
        tf.cell?.isScrollable = true
        tf.delegate = context.coordinator
        return tf
    }

    func updateNSView(_ tf: NSTextField, context: Context) {
        if tf.stringValue != text {
            tf.stringValue = text
        }
        // 焦点联动
        if isFocused, tf.window?.firstResponder != tf.currentEditor() {
            tf.window?.makeFirstResponder(tf)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        let parent: TitleField
        init(_ parent: TitleField) { self.parent = parent }

        // 核心：拦截编辑器命令（含方向键）
        func control(_ control: NSControl,
                     textView: NSTextView,
                     doCommandBy commandSelector: Selector) -> Bool {
            print("🎯 TitleField 拦截命令: \(commandSelector)")
            switch commandSelector {
            case #selector(NSResponder.moveUp(_:)):
                print("⬆️ 标题框拦截上箭头，切换项目")
                parent.onArrowUp()
                return true   // 已处理，阻止默认行为
            case #selector(NSResponder.moveDown(_:)):
                print("⬇️ 标题框拦截下箭头，切换项目")
                parent.onArrowDown()
                return true   // 已处理，阻止默认行为
            case #selector(NSResponder.insertNewline(_:)):
                // 可选：阻止回车插入换行（标题单行）
                print("↵ 标题框阻止回车换行")
                return true
            default:
                return false  // 其余命令走系统默认
            }
        }

        // 同步文本、焦点状态
        func controlTextDidChange(_ obj: Notification) {
            if let tf = obj.object as? NSTextField {
                parent.text = tf.stringValue
            }
        }
        func controlTextDidBeginEditing(_ obj: Notification) {
            print("📝 标题框开始编辑")
            parent.isFocused = true
        }
        func controlTextDidEndEditing(_ obj: Notification) {
            print("📝 标题框结束编辑")
            parent.isFocused = false
        }
    }
}