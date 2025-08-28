import Foundation

protocol ClipboardServiceType {
    func readClipboardText() -> String?
    func setTestContent(_ content: String)
}
