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

---

## 开发反思与经验总结

### 核心技术洞察

**1. macOS原生开发的复杂性**
- **权限系统**：每个系统功能都需要明确的权限声明和用户授权，开发过程中需要反复重新授权
- **混合架构挑战**：SwiftUI + AppKit的集成需要深入理解两个框架的差异和限制
- **系统级功能**：全局快捷键监听和跨Space窗口显示涉及底层系统API，调试困难

**2. 架构设计的演进**
- **初期**：单文件设计（458行）导致可维护性问题
- **重构**：按职责模块化拆分，每个文件职责单一
- **最终**：形成清晰的服务层（Service）+ 视图层（Views）架构

**3. 关键技术突破**
- **SwiftUI绑定机制**：发现不能随意替换NSViewRepresentable中的NSView实例
- **全局事件监听**：使用NSEvent.addLocalMonitorForEvents实现精确的事件过滤
- **窗口跨Space显示**：NSPanel + Accessory策略 + CGShieldingWindowLevel的组合方案

### 重大错误与教训

**1. 功能冲突的系统性调试**
- **错误**：添加快捷键功能导致剪贴板失效，但编译无错误
- **根因**：替换NSTextView的documentView破坏了SwiftUI的数据绑定
- **教训**：功能性问题不会产生编译错误，需要系统性分析代码变更的影响范围

**2. 对框架机制理解不足**
- **错误**：认为NSMenuItem.keyEquivalent会全局生效
- **真相**：keyEquivalent只在菜单激活时生效，全局快捷键需要其他方案
- **教训**：不要基于表面理解使用API，需要深入了解工作原理

**3. 权限配置的完整性**
- **错误**：只配置辅助功能权限，忽略剪贴板访问权限
- **后果**：应用无法读取剪贴板内容
- **教训**：macOS权限系统复杂，需要完整配置所有相关权限

### 外部专家指导的关键作用

**1. 窗口跨Space问题解决**
- **我的尝试**：各种NSWindowCollectionBehavior组合，均以失败告终
- **专家指导**：NSPanel + Accessory策略 + CGShieldingWindowLevel的成熟方案
- **价值**：避免了走私有API的危险路径，获得了稳定可靠的解决方案

**2. 键盘导航实现指导**
- **我的困惑**：SwiftUI + AppKit混合架构下的事件传递机制
- **专家指导**：在field editor命令层直接拦截，响应者链最短最稳定
- **价值**：学会了选择最合适的事件处理层级

**3. 架构设计建议**
- **专家建议**："分层处理原则：局部处理 + 全局兜底"
- **应用效果**：形成了清晰的事件处理架构，各组件职责明确
- **价值**：建立了可扩展的技术架构

### 开发方法论收获

**1. 问题分析方法**
- **从表象到本质**：多屏问题实际是Mission Control Spaces问题
- **系统性分析**：功能冲突需要分析完整的代码变更影响
- **逐层调试**：复杂问题需要在不同层级添加调试信息

**2. 技术学习策略**
- **基础优先**：对框架原理的理解比API调用更重要
- **实践验证**：不要基于假设编程，每个API都要实际测试
- **社区智慧**：开源项目和专家经验是宝贵的学习资源

**3. 项目管理经验**
- **版本控制**：每个重要节点都要commit保存点
- **文档记录**：详细记录踩坑过程对后续开发有巨大价值
- **模块化重构**：及时重构避免技术债务累积

### 对后续开发的指导价值

**1. 技术选型原则**
- 优先选择成熟稳定的技术方案
- 避免过度依赖私有API
- 混合架构需要充分理解各框架的限制

**2. 开发流程优化**
- 权限配置要完整，避免功能性bug
- 复杂功能要分步实现和测试
- 及时重构保持代码质量

**3. 知识体系建设**
- 建立系统的macOS开发知识框架
- 理解操作系统的设计原理和限制
- 培养解决复杂问题的调试能力

这个项目虽然看似简单，但涉及了macOS开发的多个深层次问题，为理解系统级开发提供了宝贵的实战经验。通过专家指导和自我反思，形成了一套可复用的开发模式和技术方案。