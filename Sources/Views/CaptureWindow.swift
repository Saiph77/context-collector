import SwiftUI
import AppKit
import Combine

struct CaptureWindow: View {
    @StateObject private var viewModel: CaptureViewModel
    @StateObject private var keyboardNav = KeyboardNavigationManager()
    @State private var isTitleFocused: Bool = false
    @State private var isContentEditorFocused: Bool = false

    var onClose: ((_ afterSave: Bool) -> Void)?
    var onMinimize: (() -> Void)?

    init(services: ServiceContainer,
         onClose: ((_ afterSave: Bool) -> Void)? = nil,
         onMinimize: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CaptureViewModel(services: services))
        self.onClose = onClose
        self.onMinimize = onMinimize
    }
    
    var body: some View {
        HStack(spacing: 0) {
            // 左侧项目选择器
            ProjectSelectionView(
                projects: viewModel.projects,
                selectedProject: viewModel.selectedProject,
                keyboardSelectedIndex: keyboardNav.selectedProjectIndex,
                onProjectSelected: { project, index in
                    selectProject(project, index: index)
                },
                onNewProject: {
                    viewModel.showingNewProjectDialog = true
                    viewModel.newProjectName = ""
                }
            )
            
            // 主内容区域
            VStack(spacing: 16) {
                // 标题栏
                HStack {
                    Text("Context Collector")
                        .font(.title2)
                        .fontWeight(.medium)
                    
                    Spacer()
                    
                    // 最小化按钮
                    Button("➖") {
                        onMinimize?()
                    }
                    .buttonStyle(.plain)
                    .help("最小化到Dock")
                    
                    // 关闭按钮
                    Button("❌") {
                        onClose?(false)
                    }
                    .buttonStyle(.plain)
                    .help("关闭窗口")
                }
                .padding()
                
                // 当前项目显示
                HStack {
                    Text("当前项目:")
                        .foregroundColor(.secondary)
                    Text(viewModel.selectedProject ?? "Inbox")
                        .foregroundColor(.accentColor)
                        .fontWeight(.medium)
                    Spacer()
                }
                .padding(.horizontal)
                
                // 标题输入
                HStack {
                    Text("标题:")
                        .frame(width: 50, alignment: .leading)
                    TitleField(
                        text: $viewModel.title,
                        isFocused: $isTitleFocused,
                        onArrowUp: { keyboardNav.moveSelectionUp() },
                        onArrowDown: { keyboardNav.moveSelectionDown() }
                    )
                    .frame(height: 24) // 让布局接近原 TextField
                }
                .padding(.horizontal)
                
                // 内容编辑器
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("内容:")
                        Spacer()
                        Text("⌘B 加粗")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    if viewModel.isLoading {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("正在加载剪贴板内容...")
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        AdvancedTextEditor(
                            text: $viewModel.content,
                            isFocused: $isContentEditorFocused
                        )
                        .border(Color.gray.opacity(0.3))
                            .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
                                // 窗口成为焦点时，设置快捷键处理
                            }
                    }
                }
                .padding(.horizontal)
                
                // 底部按钮
                HStack {
                    Button("重新加载剪贴板") {
                        viewModel.loadClipboardContent()
                    }
                    
                    Spacer()
                    
                    Button("保存") {
                        if viewModel.saveContent() {
                            onClose?(true)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    
                    Button("取消") {
                        onClose?(false)
                    }
                }
                .padding()
            }
        }
        .frame(width: 800, height: 500)
        .onAppear {
            loadInitialData()
        }
        .onReceive(AppEvents.shared.saveRequested) { _ in
            if viewModel.saveContent() {
                onClose?(true)
            }
        }
        .onKeyPress(.upArrow) {
            if isTitleFocused {               // ✅ 标题栏内，拦截导航
                print("⬆️ 标题栏上箭头，切换项目")
                keyboardNav.moveSelectionUp()
                return .handled
            }
            if !isContentEditorFocused {      // ✅ 只要不在编辑器，就导航
                print("⬆️ 根视图处理上箭头（项目导航）")
                keyboardNav.moveSelectionUp()
                return .handled
            }
            print("⬆️ 内容编辑器内，交给NSTextView处理光标移动")
            return .ignored                   // ✅ 在内容编辑器内，交给 NSTextView 处理（移动光标）
        }
        .onKeyPress(.downArrow) {
            if isTitleFocused {
                print("⬇️ 标题栏下箭头，切换项目")
                keyboardNav.moveSelectionDown()
                return .handled
            }
            if !isContentEditorFocused {
                print("⬇️ 根视图处理下箭头（项目导航）")
                keyboardNav.moveSelectionDown()
                return .handled
            }
            print("⬇️ 内容编辑器内，交给NSTextView处理光标移动")
            return .ignored
        }
        .onKeyPress(.return) {
            if !isContentEditorFocused {
                print("↵ 根视图处理Enter键（兜底逻辑）")
                keyboardNav.confirmSelection()
                return .handled
            }
            return .ignored
        }
        .sheet(isPresented: $viewModel.showingNewProjectDialog) {
            NewProjectDialog(
                projectName: $viewModel.newProjectName,
                onSave: { name in
                    createNewProject(name: name)
                    viewModel.showingNewProjectDialog = false
                },
                onCancel: {
                    viewModel.showingNewProjectDialog = false
                }
            )
        }
    }

    private func loadInitialData() {
        print("📋 加载初始数据")
        viewModel.loadInitialData()

        keyboardNav.setup(projects: viewModel.projects) { project, index in
            selectProject(project, index: index)
        }
        keyboardNav.setSelectedProject(viewModel.selectedProject, in: viewModel.projects)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isTitleFocused = true
        }
    }

    private func createNewProject(name: String) {
        viewModel.createNewProject(name: name)
        keyboardNav.setup(projects: viewModel.projects) { project, index in
            selectProject(project, index: index)
        }
        let newIndex = viewModel.projects.firstIndex(of: name) ?? -1
        selectProject(name, index: newIndex)
    }

    /// 选择项目并更新状态
    private func selectProject(_ project: String?, index: Int) {
        viewModel.selectProject(project)
        keyboardNav.selectedProjectIndex = index
    }
    
}
