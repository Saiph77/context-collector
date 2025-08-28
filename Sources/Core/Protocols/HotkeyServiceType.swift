import Foundation

protocol HotkeyServiceType {
    var onDoubleCmdC: (() -> Void)? { get set }
    func startListening() -> Bool
    func stopListening()
}
