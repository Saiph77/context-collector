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
        // 不再自动成为第一响应者，避免与SwiftUI的FocusState冲突
        print("📍 KeyCaptureView 已添加到窗口")
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
    func handleKeyDown(_ event: NSEvent, isTitleFocused: Bool, isContentFocused: Bool) -> Bool {
        print("🎯 键盘事件: keyCode=\(event.keyCode), 标题焦点: \(isTitleFocused), 内容焦点: \(isContentFocused)")

        // 处理项目导航的条件：
        // 1. 焦点不在任何编辑框时（项目列表区域）
        // 2. 焦点在标题栏时，允许上下键用于项目导航（因为标题栏是单行，不需要上下键移动光标）
        
        // 只有内容编辑器有焦点时才完全忽略导航键
        if isContentFocused {
            print("⏸️ 焦点在内容编辑器内，忽略导航键事件")
            return false // 内容编辑器需要方向键用于光标移动
        }
        
        // 标题栏焦点时，只处理上下方向键（用于项目导航），左右键让TextField处理
        if isTitleFocused && (event.keyCode == 123 || event.keyCode == 124) {
            print("➡️ 标题栏焦点，左右键交给TextField处理")
            return false // 让TextField处理左右键
        }
        
        switch event.keyCode {
        case 126: // 上箭头
            print("⬆️ 处理上箭头进行项目导航")
            moveSelectionUp()
            return true
        case 125: // 下箭头
            print("⬇️ 处理下箭头进行项目导航")
            moveSelectionDown()
            return true
        case 36: // Enter键
            print("↵ 处理Enter键确认项目选择")
            confirmSelection()
            return true
        default:
            return false
        }
    }
    
    /// 向上移动选择
    func moveSelectionUp() {
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
    func moveSelectionDown() {
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
    func confirmSelection() {
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