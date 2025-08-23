# Context Collector 开发文档

## 功能模块设计

### 1. HotkeyService - 全局键监听模块

**职责**: 监听全局快捷键，检测双击 ⌘C 事件

**核心功能**:
- 使用 CGEventTap 监听全局键盘事件
- 检测连续两次 ⌘C 按键 (时间窗口可配置)
- 触发回调通知主应用

**关键实现点**:
- 需要辅助功能权限
- 时间窗口默认 400ms，可配置 300-600ms
- 防止事件重复触发

```swift
final class HotkeyService: ObservableObject {
    private var eventTap: CFMachPort?
    private var lastCmdCTime: TimeInterval = 0
    private let doubleTapThreshold: TimeInterval = 0.4
    
    var onDoubleCmdC: (() -> Void)?
    
    func startListening()
    func stopListening()
    private func handleKeyEvent(_ event: CGEvent) -> Bool
}
```

### 2. ClipboardService - 剪贴板操作模块

**职责**: 读取剪贴板内容，提供纯文本数据

**核心功能**:
- 读取剪贴板纯文本内容
- 处理 RTF/HTML 到纯文本的降级转换
- 保持换行和缩进格式

**关键实现点**:
- 优先获取纯文本类型
- 如果只有富文本，转换为纯文本
- 处理空剪贴板的情况

```swift
struct ClipboardService {
    static func readPlainText() -> String?
    private static func stripRichText(_ richText: NSAttributedString) -> String
    private static func convertHTMLToPlainText(_ html: String) -> String
}
```

### 3. StorageService - 文件存储模块

**职责**: 管理文件存储、路径生成、文件命名

**核心功能**:
- 创建和管理目录结构
- 生成标准化的文件路径和名称
- 处理文件名冲突 (添加 -a, -b 后缀)
- 原子文件写入操作
- 文件名清洗 (移除非法字符)

**目录结构**:
```
~/ContextCollector/
├── inbox/YYYY-MM-DD/
└── projects/{project}/YYYY-MM-DD/
```

**文件命名规则**:
- 格式: `HH-mm_<title>.md`
- 非法字符替换: `\/:*?"<>|` → `-`
- 空标题默认: `untitled`
- 重名处理: 添加 `-a`, `-b`, `-c` 等后缀

```swift
final class StorageService {
    static let shared = StorageService()
    
    private let baseDirectory: URL
    
    func ensureDirectoryStructure()
    func getProjectsDirectory() -> URL
    func getInboxDirectory() -> URL
    func generateFilePath(project: String?, title: String) -> URL
    func sanitizeTitle(_ title: String) -> String
    func resolveNameConflict(at url: URL) -> URL
    func atomicWrite(_ content: String, to url: URL) throws
    
    private func createDateDirectory(in parentDir: URL) -> URL
    private func generateTimestamp() -> String // HH-mm format
}
```

### 4. ProjectsService - 项目管理模块

**职责**: 管理项目列表，创建新项目

**核心功能**:
- 扫描 projects 目录获取项目列表
- 创建新项目 (创建对应文件夹)
- 验证项目名称合法性
- 提供项目选择接口

```swift
final class ProjectsService: ObservableObject {
    @Published var projects: [String] = []
    @Published var selectedProject: String?
    
    func refreshProjects()
    func createProject(_ name: String) throws
    func validateProjectName(_ name: String) -> Bool
    
    private func scanProjectsDirectory() -> [String]
}
```

### 5. CaptureViewModel - 主界面状态管理

**职责**: 管理主界面状态，协调各个服务模块

**核心功能**:
- 管理界面状态 (项目选择、标题、正文内容)
- 协调保存操作
- 处理用户交互事件
- 管理窗口显示/隐藏

```swift
final class CaptureViewModel: ObservableObject {
    @Published var selectedProject: String? = nil
    @Published var title: String = "untitled"
    @Published var content: String = ""
    @Published var isVisible: Bool = false
    @Published var saveStatus: SaveStatus = .idle
    
    private let storageService = StorageService.shared
    private let projectsService = ProjectsService()
    private let clipboardService = ClipboardService()
    
    func showCapture()
    func hideCapture()
    func loadClipboardContent()
    func saveContent()
    func resetForm()
    
    enum SaveStatus {
        case idle, saving, success, error(String)
    }
}
```

### 6. MarkdownTextView - 文本编辑器组件

**职责**: 提供富文本编辑功能，支持 Markdown 快捷操作

**核心功能**:
- 包裹/取消包裹选中文本为粗体 (`**text**`)
- 行首添加/移除注释 (`//`)
- 快捷键处理 (⌘B, ⌘/, ⌘S)
- 文本选择和光标管理

**关键实现点**:
- 使用 NSTextView 并封装为 SwiftUI 组件
- 智能识别已包裹的文本进行切换
- 仅在行首识别注释，避免与 URL 冲突
- 支持多行选择的批量操作

```swift
struct MarkdownTextView: NSViewRepresentable {
    @Binding var text: String
    var onSave: () -> Void
    
    func makeNSView(context: Context) -> NSScrollView
    func updateNSView(_ nsView: NSScrollView, context: Context)
    
    class Coordinator: NSObject, NSTextViewDelegate {
        func textDidChange(_ notification: Notification)
        func handleKeyCommand(_ command: String)
        
        private func toggleBold()
        private func toggleComment()
        private func wrapSelectedText(with wrapper: String)
        private func toggleLineComment()
    }
}
```

### 7. PreferencesService - 配置管理模块

**职责**: 管理应用配置和用户偏好设置

**核心功能**:
- 存储和读取用户偏好设置
- 提供配置项的默认值
- 验证配置项的有效性
- 配置变更通知

```swift
final class PreferencesService: ObservableObject {
    @Published var baseDirectory: URL
    @Published var doubleTapThreshold: TimeInterval
    @Published var autoCloseAfterSave: Bool
    @Published var insertDefaultComment: Bool
    
    static let shared = PreferencesService()
    
    func savePreferences()
    func loadPreferences()
    func resetToDefaults()
    
    private func validateDirectory(_ url: URL) -> Bool
    private func validateThreshold(_ threshold: TimeInterval) -> Bool
}
```

## API 接口设计

### 服务间通信协议

#### HotkeyService 事件接口
```swift
protocol HotkeyServiceDelegate: AnyObject {
    func hotkeyService(_ service: HotkeyService, didDetectDoubleCmdC: Void)
}
```

#### 存储服务接口
```swift
protocol StorageServiceProtocol {
    func saveContent(_ content: String, title: String, project: String?) async throws -> URL
    func getProjectsList() -> [String]
    func createProject(_ name: String) throws
}
```

#### 编辑器回调接口
```swift
protocol MarkdownEditorDelegate: AnyObject {
    func editorDidRequestSave(_ editor: MarkdownTextView)
    func editorDidChangeText(_ editor: MarkdownTextView, text: String)
}
```

### 错误处理定义

```swift
enum ContextCollectorError: LocalizedError {
    case permissionDenied
    case fileWriteError(underlying: Error)
    case invalidProjectName(String)
    case clipboardAccessError
    case directoryCreationError(path: String)
    
    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "需要辅助功能权限才能监听全局快捷键"
        case .fileWriteError(let error):
            return "文件保存失败: \(error.localizedDescription)"
        case .invalidProjectName(let name):
            return "项目名称无效: \(name)"
        case .clipboardAccessError:
            return "无法访问剪贴板内容"
        case .directoryCreationError(let path):
            return "无法创建目录: \(path)"
        }
    }
}
```

### 数据模型定义

```swift
struct CaptureSession {
    let id: UUID
    let timestamp: Date
    let project: String?
    let title: String
    let content: String
    let filePath: URL?
    
    var isInInbox: Bool {
        return project == nil
    }
}

struct ProjectInfo {
    let name: String
    let createdDate: Date
    let fileCount: Int
    let lastModified: Date
}

struct CapturePreferences {
    var baseDirectory: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("ContextCollector")
    var doubleTapThreshold: TimeInterval = 0.4
    var autoCloseAfterSave: Bool = false
    var insertDefaultComment: Bool = true
    var defaultCommentText: String = "// 说明："
}
```

## 性能考虑

### 内存管理
- 使用弱引用避免循环引用
- 及时释放大文本内容
- 合理管理 NSTextView 的内存占用

### 文件操作优化
- 使用原子写入避免文件损坏
- 异步执行文件 I/O 操作
- 缓存项目列表避免频繁磁盘扫描

### 响应性优化
- 全局键监听使用独立线程
- UI 更新确保在主线程执行
- 避免阻塞主线程的长时间操作

## 安全考虑

### 权限管理
- 明确说明需要的权限及用途
- 优雅处理权限被拒绝的情况
- 最小权限原则

### 数据安全
- 不在日志中记录敏感内容
- 使用安全的文件路径操作
- 验证用户输入避免路径注入

### 隐私保护
- 不收集用户数据
- 本地存储所有内容
- 不进行网络通信