import SwiftUI
import AppKit

// MARK: - 键盘导航处理器
struct KeyEventHandler: NSViewRepresentable {
    let onKeyDown: (NSEvent) -> Bool
    
    func makeNSView(context: Context) -> NSView {
        let view = KeyCaptureView()
        view.onKeyDown = onKeyDown
        return view
    }
    
    func updateNSView(_ nsView: NSView, context: Context) {
        if let view = nsView as? KeyCaptureView {
            view.onKeyDown = onKeyDown
        }
    }
}

class KeyCaptureView: NSView {
    var onKeyDown: ((NSEvent) -> Bool)?
    
    override var acceptsFirstResponder: Bool { true }
    override var canBecomeKeyView: Bool { true }
    
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        // 当视图添加到窗口时，确保它成为第一响应者
        DispatchQueue.main.async {
            self.window?.makeFirstResponder(self)
        }
    }
    
    override func keyDown(with event: NSEvent) {
        print("🎹 KeyCaptureView 接收到按键: keyCode=\(event.keyCode)")
        if let handler = onKeyDown, handler(event) {
            // 事件已处理
            print("✅ 按键事件已被处理")
            return
        }
        print("➡️ 按键事件传递给父类")
        super.keyDown(with: event)
    }
}

// MARK: - 键盘导航逻辑
class KeyboardNavigationManager: ObservableObject {
    @Published var selectedProjectIndex: Int = -1 // -1表示选择Inbox，0+表示项目索引
    
    private var projects: [String] = []
    private var onProjectSelected: ((String?, Int) -> Void)?
    
    func setup(projects: [String], onProjectSelected: @escaping (String?, Int) -> Void) {
        self.projects = projects
        self.onProjectSelected = onProjectSelected
    }
    
    /// 键盘事件处理
    func handleKeyDown(_ event: NSEvent, isTitleFocused: Bool) -> Bool {
        print("🎯 KeyboardNavigationManager 处理按键: keyCode=\(event.keyCode), isTitleFocused=\(isTitleFocused)")
        
        guard !isTitleFocused else { 
            print("⏸️ 标题输入框有焦点，跳过方向键处理")
            return false 
        } // 如果标题输入框有焦点，不处理方向键
        
        switch event.keyCode {
        case 126: // 上箭头
            print("⬆️ 处理上箭头")
            moveSelectionUp()
            return true
        case 125: // 下箭头
            print("⬇️ 处理下箭头")
            moveSelectionDown()
            return true
        case 36: // Enter键
            print("↵ 处理Enter键")
            confirmSelection()
            return true
        default:
            print("❓ 未处理的按键: \(event.keyCode)")
            return false
        }
    }
    
    /// 向上移动选择
    private func moveSelectionUp() {
        if selectedProjectIndex > -1 {
            selectedProjectIndex -= 1
            selectProjectByIndex(selectedProjectIndex)
        } else if selectedProjectIndex == -1 && !projects.isEmpty {
            // 从Inbox向上到最后一个项目
            selectedProjectIndex = projects.count - 1
            selectProjectByIndex(selectedProjectIndex)
        }
    }
    
    /// 向下移动选择
    private func moveSelectionDown() {
        if selectedProjectIndex < projects.count - 1 {
            selectedProjectIndex += 1
            selectProjectByIndex(selectedProjectIndex)
        } else if selectedProjectIndex == projects.count - 1 {
            // 从最后一个项目向下到Inbox
            selectProject(nil, index: -1)
        } else if selectedProjectIndex == -1 && !projects.isEmpty {
            // 从Inbox向下到第一个项目
            selectProject(projects[0], index: 0)
        }
    }
    
    /// 根据索引选择项目
    private func selectProjectByIndex(_ index: Int) {
        if index == -1 {
            selectProject(nil, index: -1)
        } else if index >= 0 && index < projects.count {
            selectProject(projects[index], index: index)
        }
    }
    
    /// 选择项目并更新索引
    private func selectProject(_ project: String?, index: Int) {
        selectedProjectIndex = index
        onProjectSelected?(project, index)
        print("📂 选择项目: \(project ?? "Inbox"), 索引: \(index)")
    }
    
    /// 确认选择当前键盘聚焦的项目
    private func confirmSelection() {
        selectProjectByIndex(selectedProjectIndex)
    }
    
    /// 设置当前选择的项目索引
    func setSelectedProject(_ project: String?, in projects: [String]) {
        self.projects = projects
        if let project = project {
            selectedProjectIndex = projects.firstIndex(of: project) ?? -1
        } else {
            selectedProjectIndex = -1
        }
    }
}