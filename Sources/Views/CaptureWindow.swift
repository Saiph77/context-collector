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
    @State private var selectedProjectIndex: Int = -1 // -1表示选择Inbox，0+表示项目索引
    @FocusState private var isTitleFocused: Bool
    
    var onClose: (() -> Void)?
    var onMinimize: (() -> Void)?
    
    var body: some View {
        HStack(spacing: 0) {
            // 左侧项目选择器
            VStack(alignment: .leading, spacing: 8) {
                Text("项目")
                    .font(.headline)
                    .padding(.horizontal)
                
                // Inbox选项
                ProjectButton(
                    name: "Inbox",
                    icon: "📥",
                    isSelected: selectedProject == nil
                ) {
                    selectProject(nil, index: -1)
                }
                
                Divider()
                
                // 项目列表
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(projects.enumerated()), id: \.element) { index, project in
                            ProjectButton(
                                name: project,
                                icon: "📁",
                                isSelected: selectedProject == project
                            ) {
                                selectProject(project, index: index)
                            }
                        }
                    }
                }
                
                Spacer()
                
                // 新增项目按钮
                Button(action: {
                    showingNewProjectDialog = true
                    newProjectName = ""
                }) {
                    HStack(spacing: 8) {
                        Text("➕")
                        Text("新增项目")
                            .font(.system(size: 13))
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.blue.opacity(0.1))
                    )
                    .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .frame(width: 200)
            .background(Color(NSColor.controlBackgroundColor))
            
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
                    TextField("输入标题", text: $title)
                        .textFieldStyle(.roundedBorder)
                        .focused($isTitleFocused)
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
                        AdvancedTextEditor(text: $content)
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
            // 自动焦点到标题输入框
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                isTitleFocused = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            // 窗口成为焦点时设置键盘事件监听
        }
        .background(KeyEventHandler { event in
            handleKeyDown(event)
        })
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
        if let lastProject = lastProject {
            if projects.contains(lastProject) {
                selectedProject = lastProject
                selectedProjectIndex = projects.firstIndex(of: lastProject) ?? -1
            } else {
                // 如果上次的项目不存在了，选择Inbox
                selectedProject = nil
                selectedProjectIndex = -1
            }
        } else {
            selectedProject = nil
            selectedProjectIndex = -1
        }
        
        loadClipboardContent()
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
            selectProject(name, index: projects.firstIndex(of: name) ?? -1)
        } else {
            print("❌ 项目创建失败")
        }
    }
    
    // MARK: - 新增的辅助方法
    
    /// 选择项目并更新索引
    private func selectProject(_ project: String?, index: Int) {
        selectedProject = project
        selectedProjectIndex = index
        print("📂 选择项目: \(project ?? "Inbox"), 索引: \(index)")
    }
    
    /// 键盘事件处理
    private func handleKeyDown(_ event: NSEvent) -> Bool {
        guard !isTitleFocused else { return false } // 如果标题输入框有焦点，不处理方向键
        
        switch event.keyCode {
        case 126: // 上箭头
            moveSelectionUp()
            return true
        case 125: // 下箭头
            moveSelectionDown()
            return true
        default:
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
    
}

// MARK: - 键盘事件处理器
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
    
    override func keyDown(with event: NSEvent) {
        if let handler = onKeyDown, handler(event) {
            // 事件已处理
            return
        }
        super.keyDown(with: event)
    }
}