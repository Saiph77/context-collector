import Foundation
import Combine
#if canImport(AppKit)
import AppKit
#endif

/// 全局应用事件总线
final class AppEvents {
    static let shared = AppEvents()

    /// 保存动作
    let save = PassthroughSubject<Void, Never>()

    /// 文本查找相关动作
    let performTextFinderAction = PassthroughSubject<NSTextFinder.Action, Never>()

    private init() {}
}
