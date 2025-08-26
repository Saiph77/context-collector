import AppKit

/// 协调标准命令，将其转发到事件总线
final class CommandCoordinator {
    private let events: AppEvents
    private let proxy: ActionProxy

    init(events: AppEvents = .shared) {
        self.events = events
        self.proxy = ActionProxy(events: events)
    }

    /// 将代理插入到 responder 链
    func install() {
        let app = NSApp
        proxy.nextResponder = app.nextResponder
        app.nextResponder = proxy
    }
}

/// 负责截获标准动作并转发到事件总线的代理
private final class ActionProxy: NSResponder {
    private let events: AppEvents

    init(events: AppEvents) {
        self.events = events
    }

    override func save(_ sender: Any?) {
        events.save.send(())
    }

    override func performTextFinderAction(_ sender: Any?) {
        if let action = sender as? NSTextFinder.Action {
            events.performTextFinderAction.send(action)
        }
    }
}
