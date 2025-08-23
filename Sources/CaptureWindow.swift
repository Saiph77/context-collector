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
                    selectedProject = nil
                }
                
                Divider()
                
                // 项目列表
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(projects, id: \.self) { project in
                            ProjectButton(
                                name: project,
                                icon: "📁",
                                isSelected: selectedProject == project
                            ) {
                                selectedProject = project
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
            selectedProject = name
        } else {
            print("❌ 项目创建失败")
        }
    }
    
}

struct ProjectButton: View {
    let name: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(icon)
                Text(name)
                    .font(.system(size: 13))
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(backgroundColor)
            )
            .foregroundColor(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .onHover { hovering in
            isHovered = hovering
        }
    }
    
    private var backgroundColor: Color {
        if isSelected {
            return Color.accentColor
        } else if isHovered {
            return Color.gray.opacity(0.2)
        } else {
            return Color.clear
        }
    }
}

struct NewProjectDialog: View {
    @Binding var projectName: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Text("新增项目")
                .font(.title2)
                .fontWeight(.medium)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("项目名称:")
                    .font(.headline)
                
                TextField("输入项目名称", text: $projectName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 300)
                    .onSubmit {
                        if !projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            onSave(projectName.trimmingCharacters(in: .whitespacesAndNewlines))
                        }
                    }
            }
            
            HStack(spacing: 12) {
                Button("取消") {
                    onCancel()
                }
                .keyboardShortcut(.escape)
                
                Button("创建") {
                    if !projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        onSave(projectName.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return)
                .disabled(projectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(30)
        .frame(width: 400, height: 200)
    }
}


struct AdvancedTextEditor: NSViewRepresentable {
    @Binding var text: String
    var onBoldToggle: (() -> Void)?
    
    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        let textView = scrollView.documentView as! NSTextView
        
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.string = text
        
        // 启用撤销功能
        textView.allowsUndo = true
        
        // 添加快捷键处理 - 使用 NSTextView 的内置机制
        textView.menu = createContextMenu(for: textView, coordinator: context.coordinator)
        
        // 为 coordinator 设置 textView 引用，用于快捷键处理
        context.coordinator.textView = textView
        
        return scrollView
    }
    
    func updateNSView(_ nsView: NSScrollView, context: Context) {
        let textView = nsView.documentView as! NSTextView
        if textView.string != text {
            textView.string = text
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    private func createContextMenu(for textView: NSTextView, coordinator: Coordinator) -> NSMenu {
        let menu = NSMenu()
        
        let boldItem = NSMenuItem(title: "粗体 (⌘B)", action: #selector(Coordinator.toggleBold), keyEquivalent: "b")
        boldItem.keyEquivalentModifierMask = .command
        boldItem.target = coordinator  // 修正：指向正确的 Coordinator 实例
        menu.addItem(boldItem)
        
        // 添加撤销/重做菜单项
        menu.addItem(NSMenuItem.separator())
        
        let undoItem = NSMenuItem(title: "撤销 (⌘Z)", action: #selector(Coordinator.undo(_:)), keyEquivalent: "z")
        undoItem.keyEquivalentModifierMask = NSEvent.ModifierFlags.command
        undoItem.target = coordinator
        menu.addItem(undoItem)
        
        let redoItem = NSMenuItem(title: "重做 (⌘⇧Z)", action: #selector(Coordinator.redo(_:)), keyEquivalent: "z")
        redoItem.keyEquivalentModifierMask = [NSEvent.ModifierFlags.command, NSEvent.ModifierFlags.shift]
        redoItem.target = coordinator
        menu.addItem(redoItem)
        
        return menu
    }
    
    class Coordinator: NSObject, NSTextViewDelegate {
        let parent: AdvancedTextEditor
        weak var textView: NSTextView?
        
        init(_ parent: AdvancedTextEditor) {
            self.parent = parent
        }
        
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
        }
        
        @objc func toggleBold(_ sender: AnyObject) {
            // 使用保存的 textView 引用
            guard let textView = self.textView else { return }
            
            let selectedRange = textView.selectedRange()
            let fullText = textView.string
            let startIndex = fullText.index(fullText.startIndex, offsetBy: selectedRange.location)
            let endIndex = fullText.index(startIndex, offsetBy: selectedRange.length)
            let selectedText = String(fullText[startIndex..<endIndex])
            
            if selectedText.isEmpty {
                // 没有选中文本，插入模板
                let insertText = "**粗体文本**"
                textView.insertText(insertText, replacementRange: selectedRange)
                
                // 选中"粗体文本"部分
                let newRange = NSRange(location: selectedRange.location + 2, length: 4)
                textView.setSelectedRange(newRange)
            } else {
                // 有选中文本，添加粗体标记
                let boldText = "**\(selectedText)**"
                textView.insertText(boldText, replacementRange: selectedRange)
                
                // 重新选中加粗后的文本
                let newRange = NSRange(location: selectedRange.location, length: boldText.count)
                textView.setSelectedRange(newRange)
            }
            
            parent.text = textView.string
        }
        
        @objc func undo(_ sender: AnyObject) {
            guard let textView = self.textView else { return }
            textView.undoManager?.undo()
            parent.text = textView.string
        }
        
        @objc func redo(_ sender: AnyObject) {
            guard let textView = self.textView else { return }
            textView.undoManager?.redo()
            parent.text = textView.string
        }
    }
}