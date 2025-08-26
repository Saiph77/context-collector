import Foundation
import AppKit

final class ClipboardService: ClipboardServiceType {
    init() {}
    
    func readClipboardText() -> String? {
        let pasteboard = NSPasteboard.general
        
        // 首先尝试读取纯文本
        if let plainText = pasteboard.string(forType: .string) {
            print("✅ 成功读取剪贴板纯文本，长度: \(plainText.count)")
            return plainText
        }
        
        // 尝试RTF格式
        if let rtfData = pasteboard.data(forType: .rtf),
           let attributedString = NSAttributedString(rtf: rtfData, documentAttributes: nil) {
            print("✅ 从RTF转换为纯文本")
            return attributedString.string
        }
        
        // 尝试HTML格式
        if let htmlData = pasteboard.data(forType: .html),
           let htmlString = String(data: htmlData, encoding: .utf8) {
            print("✅ 从HTML转换为纯文本")
            return convertHTMLToPlainText(htmlString)
        }
        
        print("⚠️ 剪贴板中没有可读取的文本内容")
        return nil
    }
    
    private func convertHTMLToPlainText(_ html: String) -> String {
        guard let data = html.data(using: .utf8) else { return html }
        
        do {
            let attributedString = try NSAttributedString(
                data: data,
                options: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
            )
            return attributedString.string
        } catch {
            print("⚠️ HTML转换失败: \(error)")
            return html
        }
    }
    
    // 用于测试的方法
    func setTestContent(_ content: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(content, forType: .string)
        print("🧪 设置测试剪贴板内容: \(content)")
    }
}
