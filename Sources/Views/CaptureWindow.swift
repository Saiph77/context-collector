import SwiftUI
import AppKit

struct CaptureWindow: View {
    @State private var title: String = "untitled"
    @State private var content: String = ""
    @State private var selectedProject: String?
    @State private var projects: [String] = []
    @State private var isLoading: Bool = false
    @State private var showingNewProjectDialog: Bool = false
    @State private var newProjectName: String = ""
    @StateObject private var keyboardNav = KeyboardNavigationManager()
    @State private var isTitleFocused: Bool = false
    @State private var isContentEditorFocused: Bool = false
    
    var onClose: (() -> Void)?
    var onMinimize: (() -> Void)?
    
    var body: some View {
        HStack(spacing: 0) {
            // 左侧项目选择器
            ProjectSelectionView(
                projects: projects,
                selectedProject: selectedProject,
                keyboardSelectedIndex: keyboardNav.selectedProjectIndex,
                onProjectSelected: { project, index in
                    selectProject(project, index: index)
                },
                onNewProject: {
                    showingNewProjectDialog = true
                    newProjectName = ""
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
                        onClose?()
                    }
                    .buttonStyle(.plain)
                    .help("关闭窗口")
                }
                .padding()
                
                // 当前项目显示
                HStack {
                    Text("当前项目:")
                        .foregroundColor(.secondary)
                    Text(selectedProject ?? "Inbox")
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
                        text: $title,
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
                    
                    if isLoading {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("正在加载剪贴板内容...")
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        AdvancedTextEditor(
                            text: $content,
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
                        loadClipboardContent()
                    }
                    
                    Spacer()
                    
                    Button("保存 (⌘S)") {
                        saveContent()
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut("s", modifiers: .command)
                    
                    Button("取消") {
                        onClose?()
                    }
                }
                .padding()
            }
        }
        .frame(width: 800, height: 500)
        .onAppear {
            loadInitialData()
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
        .sheet(isPresented: $showingNewProjectDialog) {
            NewProjectDialog(
                projectName: $newProjectName,
                onSave: { name in
                    createNewProject(name: name)
                    showingNewProjectDialog = false
                },
                onCancel: {
                    showingNewProjectDialog = false
                }
            )
        }
    }
    
    private func loadInitialData() {
        print("📋 加载初始数据")
        projects = StorageService.shared.getProjects()
        
        // 加载默认选择的项目
        let lastProject = StorageService.shared.getLastSelectedProject()
        if let lastProject = lastProject, projects.contains(lastProject) {
            selectedProject = lastProject
        } else {
            selectedProject = nil
        }
        
        // 设置键盘导航
        keyboardNav.setup(projects: projects) { project, index in
            selectProject(project, index: index)
        }
        // 更新键盘导航状态
        keyboardNav.setSelectedProject(selectedProject, in: projects)
        
        loadClipboardContent()
        
        // 自动聚焦到标题输入框 - 延迟稍微增加确保界面完全加载
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isTitleFocused = true
        }
    }
    
    private func loadClipboardContent() {
        print("📋 开始加载剪贴板内容")
        isLoading = true
        
        DispatchQueue.global(qos: .userInitiated).async {
            // 稍微延迟，确保剪贴板操作完成
            Thread.sleep(forTimeInterval: 0.1)
            
            let clipboardText = ClipboardService.shared.readClipboardText()
            
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let text = clipboardText, !text.isEmpty {
                    self.content = "// 说明：\n\n\(text)"
                    print("✅ 剪贴板内容已加载，长度: \(text.count)")
                } else {
                    self.content = "// 说明：\n\n"
                    print("ℹ️ 剪贴板为空")
                }
            }
        }
    }
    
    private func saveContent() {
        print("💾 保存内容")
        
        // 保存当前选择的项目作为默认项目
        StorageService.shared.saveLastSelectedProject(selectedProject)
        
        if let savedPath = StorageService.shared.saveContent(content, title: title, project: selectedProject) {
            print("✅ 保存成功: \(savedPath.path)")
            
            // 立即关闭窗口
            onClose?()
        } else {
            print("❌ 保存失败")
        }
    }
    
    private func saveAndClose() {
        saveContent()
    }
    
    private func createNewProject(name: String) {
        print("📁 创建新项目: \(name)")
        
        if StorageService.shared.createProject(name: name) {
            print("✅ 项目创建成功")
            projects = StorageService.shared.getProjects()
            let newIndex = projects.firstIndex(of: name) ?? -1
            selectProject(name, index: newIndex)
            // 更新键盘导航
            keyboardNav.setup(projects: projects) { project, index in
                selectProject(project, index: index)
            }
        } else {
            print("❌ 项目创建失败")
        }
    }
    
    /// 选择项目并更新状态
    private func selectProject(_ project: String?, index: Int) {
        selectedProject = project
        keyboardNav.selectedProjectIndex = index
        print("📂 选择项目: \(project ?? "Inbox"), 索引: \(index)")
    }
    
}