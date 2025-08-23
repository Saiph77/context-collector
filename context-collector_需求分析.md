# 我对你的需求的理解（需求确认）

我理解你的目标是：用 **Swift（SwiftUI + 少量 AppKit）** 在 **macOS** 上做一款“**仅用于收集与轻编辑**”的桌面工具 **Context Collector**。
核心工作流：**双击 ⌘C** 触发 → 弹出一个面板（左侧项目选择器 / 右侧单区编辑器）→ 你在**同一块编辑器**里直接**修剪原文**、用 `//` 写注释、用 `**…**` 加粗重点 → **⌘S 保存**为 **Markdown 文件**（按**项目**或 **Inbox** 分目录，按**天**分子目录，**分钟级**命名 `HH-mm_标题.md`）。媒体**仅保存路径文本**，不预览、不解析。**不做** frontmatter / 去重 / 敏感信息检测。

---

# 基于以下假设（假设透明）

**必要假设**

* 时间粒度为 **分钟**：文件名使用 `HH-mm`；落盘日期以**保存时刻**为准。
* 编辑器为**单区**：在同一文本区完成修剪、注释与加粗。
* 未选择项目时，默认落到 **Inbox**。
* 媒体只**保存路径文本**（本地或 URL），不复制文件、不预览。
* **双击 ⌘C** 是刚性需求；需要一次性**辅助功能权限**（Accessibility）以监听全局键。

**可选假设**

* 同一分钟内多次保存使用 `-a/-b/-c` 后缀避免重名（不引入秒）。
* 保存模板首行自动插入 `// 说明：`（可删）给后续 AI 留“最小钩子”。
* 文件名标题留空时使用 `untitled`；非法字符替换为 `-`。

> 若以后要跨平台、生成 frontmatter、复制媒体入库等，可在此基础上扩展。

---

# 信息汇总（信息透明）

* 触发：**双击 ⌘C**（第一次 Copy，第二次捕获），时间窗建议 **300–600ms**（可配置）。
* 读取：统一读剪贴板**纯文本**（保留换行与缩进）。
* 面板：**左侧项目选择器（含 Inbox）** + **右侧编辑器** + 标题栏。
* 编辑：`//` 行注释（建议匹配**行首**），`**…**` 加粗（⌘B 快捷键）。
* 保存：**⌘S** → `~/ContextCollector/{projects/<project>|inbox}/YYYY-MM-DD/HH-mm_<title>.md`（原子写入）。
* 不做：frontmatter、去重/防抖、敏感信息提醒、媒体预览/解析、复杂标注。

---

# 设计理念

* **最小可运行**：把“复制→建 md→粘贴→修剪→加粗→归档”的繁琐流缩到**一次热键 + 一次保存**。
* **沉浸式语境收集**：**原始材料优先**，注释与加粗只是“最低限度”的结构化信号；后续让 AI 生成 frontmatter / 因果链。
* **文件系统即数据库**：所有权交给用户；项目=文件夹；按日归档，简单直观、易被编排工具（Claude Code SDK、Cursor）消费。
* **系统原生能力优先**：全局键监听、剪贴板、窗口与文件写入全部走原生 API，减少不确定性与学习负担。

---

# 产品范围（MVP）

**必须有**

* 双击 ⌘C → 弹出面板
* 项目选择器（含 Inbox；项目=文件夹名；可新建）
* 单区编辑器（初始填充剪贴板纯文本，光标置顶）
* 快捷键：`⌘B` 包裹/去包裹 `**…**`；行首 `//` 注释（多行生效）；`⌘S` 保存；`Esc` 关闭
* 保存命名与原子写入，重名用 `-a/-b/...`

**不在 MVP**

* frontmatter、去重、敏感信息提醒、媒体预览/复制入库、复杂标注/画框、关系可视化、Git 集成

---

# 交互流程（事件流）

1. 用户在任意 App 中**连续两次**按 ⌘C（间隔 < 阈值）
2. 应用通过 `CGEventTap` 监听 → 命中“双击窗口” → **读取剪贴板纯文本**
3. 弹出面板：

   * 左侧：项目列表（来自 `~/ContextCollector/projects/*` 的文件夹名；未选=Inbox）
   * 右侧：编辑器填入剪贴板文本（顶部标题输入，默认 `untitled`；第一行可插入 `// 说明：`）
4. 用户在**同一编辑器**里：修剪、`//` 注释、`**…**` 加粗
5. `⌘S` 保存：

   * 目标目录：`projects/<project>/YYYY-MM-DD/` 或 `inbox/YYYY-MM-DD/`
   * 文件名：`HH-mm_<title>.md`（重名追加 `-a` 等）
   * 内容：编辑器内容（UTF-8 / LF），**不添加 frontmatter**
6. 可选：保存后保持窗口或关闭（偏好设置）

---

# 数据与文件约定

```
根目录（默认）: ~/ContextCollector/
├── inbox/
│   └── 2025-08-23/
│       ├── 10-15_untitled.md
│       └── 10-15_untitled-a.md
└── projects/
    └── MyProject/
        └── 2025-08-23/
            └── 10-32_接口梳理.md
```

* 文件编码：**UTF-8 / LF**
* 标题清洗：非法字符 `\/:*?"<>|` → `-`；空标题 → `untitled`
* 建议保存模板（可删第一行）：

  ```
  // 说明：

  <编辑器内容>
  ```

---

# 键位与编辑行为

* **双击 ⌘C**：触发采集（默认阈值 400ms，可在偏好里设 300–600ms）
* **⌘B**：若选区已被 `**` 包裹 → 取消；否则包裹选区为 `**<text>**`
* **注释**：自定义快捷键（如 `⌘/` 或工具栏按钮），对选中行**行首插入** `// `；再次触发可去除（可选）
* **⌘S**：保存
* **Esc**：关闭窗口（可选是否提示保存）

> `//` 行注释仅在**行首**识别，避免与 URL `https://` 混淆。

---

# 技术方案（Swift）

**框架选择**

* UI：**SwiftUI**（窗口、列表、输入）
* 文本编辑：**NSTextView** 封装到 SwiftUI（`NSViewRepresentable`），实现：

  * 包裹/去包裹选区 `**…**`
  * 对选中多行行首插入/去除 `// `
  * 监听 `⌘S`（调用外部保存回调）
* 全局键监听：**CGEventTap**（需要 Accessibility 权限）
* 剪贴板：`NSPasteboard`
* 文件：`FileManager` + 临时文件 + `moveItem` 原子写

**模块划分（建议）**

* `HotkeyService`：全局键监听、双击窗口检测（记录上次 ⌘C 时间戳）
* `ClipboardService`：读取纯文本（降级 RTF/HTML → 纯文本）
* `StorageService`：根目录/路径拼装、标题清洗、冲突后缀、原子写
* `ProjectsService`：扫描 `projects/` 文件夹，暴露“列表/新建”
* `CaptureViewModel`：面板状态（项目选择、标题、正文、保存）
* `MarkdownTextView`：`NSTextView` 封装（⌘B、注释、⌘S）
* `Preferences`：根目录、双击阈值、保存后行为

**关键函数（示意）**

```swift
final class HotkeyService {
    func startTap()
    var onDoubleCmdC: (() -> Void)?
}

struct ClipboardService {
    func readPlainText() -> String?
}

struct StorageService {
    func ensureScaffold()
    func listProjects() -> [String]
    func targetDir(project: String?) -> URL // inbox or project/day
    func sanitizedTitle(_ s: String?) -> String
    func nextFilename(base: String, at dir: URL) -> URL // add -a/-b if exists
    func atomicWrite(_ text: String, to url: URL) throws
}

final class CaptureViewModel: ObservableObject {
    @Published var project: String? // nil = inbox
    @Published var title: String = ""
    @Published var body: String = ""
    func save()
}
```

---

# To-Do（工程任务清单）

## P0（MVP）

* [ ] **项目脚手架**：SwiftUI App，禁用多窗口，统一管理主面板
* [ ] **HotkeyService**：`CGEventTap` 监听，双击 ⌘C（默认 400ms）→ 回调
* [ ] **ClipboardService**：获取纯文本（RTF/HTML → 纯文本）
* [ ] **StorageService**：

  * [ ] 初始化根目录 `~/ContextCollector`（可配置）
  * [ ] 路径：`inbox/YYYY-MM-DD/`、`projects/<project>/YYYY-MM-DD/`
  * [ ] 标题清洗、空标题→`untitled`
  * [ ] 文件名：`HH-mm_<title>.md`；重名追加 `-a/-b/...`
  * [ ] 临时写入 + 原子重命名
* [ ] **ProjectsService**：读取 `projects/` 子目录；新建项目 = 新建文件夹
* [ ] **面板 UI**：

  * [ ] 左：项目选择器（列表 + 创建）
  * [ ] 右：标题输入 + `MarkdownTextView`（预填剪贴板文本；首行插入 `// 说明：` 可删）
  * [ ] 快捷键：`⌘B`、行首 `//`、`⌘S`、`Esc`
  * [ ] 保存成功反馈（轻提示），失败给错误信息
* [ ] **偏好设置**：根目录选择器、双击阈值、保存后保持/关闭
* [ ] **首次运行指引**：弹出权限说明（辅助功能）

## P1（可选增强，仍保持简洁）

* [ ] `//` 注释二次触发自动去除
* [ ] `⌘B` 二次触发智能去包裹
* [ ] 最近使用项目快速选择
* [ ] 保存后复制路径到剪贴板（便于粘贴引用）
* [ ] 简单快捷命令：`/assets` 插入资产根路径占位符

---

# 测试用例（可验证输出）

* [ ] 任意 App 连按两次 ⌘C（< 400ms）→ 面板弹出、焦点在编辑器
* [ ] 选中文本 `⌘B` → 包裹为 `**选中文本**`；再次 `⌘B` → 去包裹（若实现）
* [ ] 选中多行 → 快捷键插入每行行首 `// `
* [ ] 输入标题、选项目（或不选→Inbox），`⌘S` → 在正确目录生成 `HH-mm_标题.md`
* [ ] 同一分钟再次保存 → 生成 `HH-mm_标题-a.md`
* [ ] 关闭窗口（Esc），再次双击 ⌘C → 恢复同等体验
* [ ] 修改根目录与阈值后仍按期望工作
* [ ] 拒绝辅助功能权限时，给出明确指引

---

# 给 Coding Agent（Cursor / Claude Code）的执行提示（可直接粘贴）

**系统目标**：
实现 macOS SwiftUI 应用 “Context Collector” 的 MVP。双击 ⌘C 捕获剪贴板文本 → 弹出面板（项目选择器 + 单区编辑器）→ 在同一编辑器内修剪、`//` 注释、`**…**` 加粗 → `⌘S` 保存为 `~/ContextCollector/{projects/<project>|inbox}/YYYY-MM-DD/HH-mm_<title>.md`。无 frontmatter、无去重、无敏感信息检测、媒体只存路径文本。

**技术约束**：

* SwiftUI + AppKit；全局键用 `CGEventTap`；编辑器用 `NSTextView` 封装；剪贴板 `NSPasteboard`；文件 `FileManager` 原子写。
* 时间窗口默认 400ms（可配置 300–600ms）。
* UTF-8 / LF。非法文件名字符替换为 `-`；空标题→`untitled`。同分钟重名追加 `-a/-b/...`。
* 首行自动插入 `// 说明：`（可删）。
* 快捷键：`⌘B` 包裹/去包裹；注释快捷键对选中行行首插入 `// `；`⌘S` 保存；`Esc` 关闭。

**模块与文件**（建议）

* `HotkeyService.swift` — CGEventTap、双击窗口检测、回调
* `ClipboardService.swift` — 纯文读取
* `StorageService.swift` — 根目录、路径、文件名、原子写
* `ProjectsService.swift` — 项目目录扫描/创建
* `CaptureViewModel.swift` — 面板状态与保存逻辑
* `MarkdownTextView.swift` — `NSTextView` 封装（包裹/注释/⌘S）
* `CaptureWindow.swift` — 面板 UI（SwiftUI）
* `Preferences.swift` — 根目录、阈值、保存后行为
* `App.swift` — 应用入口与权限指引

**任务顺序**

1. StorageService / ProjectsService（先让“保存到正确位置”跑通）
2. HotkeyService（双击 ⌘C 回调）
3. 面板 UI（项目选择 + 纯文本显示 + 标题）
4. MarkdownTextView（⌘B / 注释 / ⌘S 回调）
5. ClipboardService（填充初始文本）
6. 偏好设置与权限引导
7. 边界：重名 `-a`，非法字符替换，原子写

**验收用例**：按上节“测试用例”。

**风格与提交**

* 小步提交：每个模块独立 PR / commit，含最少可运行示例。
* 代码注释标明与“设计约束”的对应（如：为什么行首匹配 `// `）。
* 不引入三方库，除非必要（MVP 原生足够）。

---

# 可能的坑（简要提醒）

* 辅助功能权限未授权导致 `CGEventTap` 无效 → 首启指引
* 某些 App 的复制更新略滞后 → 读**当前剪贴板**，即使空也弹窗，避免“无反馈”
* URL 中 `//` 误被识别为注释 → 仅**行首**识别注释
* 超长文本在编辑器卡顿 → MVP 接受；后续再优化
* 路径文本易失效（源文件移动/清理） → MVP 接受；后续“复制到 assets/”再说

---

以上就是给 **Cursor / Claude Code** 也能直接上手的 **完整上下文与规划**。如果你确认没有遗漏，我可以在下一步把 **关键类的函数签名与伪代码** 也写出来，便于一边跑一边替换为真实实现。