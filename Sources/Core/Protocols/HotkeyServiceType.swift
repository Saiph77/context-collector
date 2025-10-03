import Foundation

// 限定为引用类型，便于通过 ServiceContainer 常量修改其可变属性
protocol HotkeyServiceType: AnyObject {
    var onDoubleCmdC: (() -> Void)? { get set }
    func startListening() -> Bool
    func stopListening()
}
