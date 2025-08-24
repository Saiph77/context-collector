# Mission Control Spaces 窗口显示技术方案

## 问题分析

### 当前问题
Context Collector窗口总是显示在Space 1（桌面空间），而不是用户当前活跃的Space。当用户在Space 2（全屏IDEA）或Space 3（全屏Chrome）中使用快捷键时，窗口不会在当前Space显示。

### 技术背景
Mission Control Spaces是macOS的虚拟桌面系统：
- 每个全屏应用会自动创建独立的Space
- 普通窗口默认只属于特定的Space
- 窗口的Space行为由`NSWindowCollectionBehavior`控制

## 技术方案分析

### 方案一：使用NSWindowCollectionBehavior.stationary
```swift
window?.collectionBehavior = [.stationary]
```
**原理**: 让窗口在所有Space中都可见，但固定在屏幕上
**优点**: 简单直接，确保在任何Space都能看到
**缺点**: 窗口会"粘"在屏幕上，用户切换Space时窗口依然可见

### 方案二：检测当前活跃Space并移动窗口
```swift
// 检测当前活跃的Space
let currentSpaceID = getCurrentActiveSpaceID()
// 将窗口移动到当前Space
moveWindowToSpace(window, spaceID: currentSpaceID)
```
**原理**: 动态检测当前Space并将窗口移动过去
**优点**: 窗口只在需要的Space中显示
**缺点**: 需要使用私有API，可能不稳定

### 方案三：使用NSWindowCollectionBehavior.moveToActiveSpace
```swift
window?.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .moveToActiveSpace]
```
**原理**: 系统自动将窗口移动到当前活跃的Space
**状态**: ❌ 测试中发现此属性可能不存在或已弃用，导致应用崩溃

### 方案四：组合使用多种CollectionBehavior
```swift
window?.collectionBehavior = [
    .canJoinAllSpaces,        // 允许出现在所有Space
    .fullScreenAuxiliary,     // 作为全屏应用的辅助窗口
    .ignoresCycle            // 不参与窗口循环
]
```
**原理**: 通过组合多个行为标志实现期望效果

### 方案五：使用CGSPrivate.h私有API
```swift
// 使用Core Graphics Services私有API
extern int CGSGetActiveSpace(int cid);
extern void CGSMoveWindowToSpace(int cid, int wid, int space);
```
**原理**: 直接调用系统底层Space管理API
**优点**: 功能强大，精确控制
**缺点**: 使用私有API，App Store审核不通过，系统更新可能失效

## 推荐实施方案

### 阶段一：基础Space支持
1. **使用安全的CollectionBehavior组合**
   ```swift
   window?.collectionBehavior = [
       .canJoinAllSpaces,      // 基础：允许在所有Space显示
       .fullScreenAuxiliary    // 重要：作为全屏应用的辅助窗口
   ]
   ```

2. **提升窗口层级确保可见性**
   ```swift
   window?.level = .popUpMenu  // 或 .screenSaver
   ```

3. **强制激活到前台**
   ```swift
   NSApp.activate(ignoringOtherApps: true)
   window?.makeKeyAndOrderFront(nil)
   ```

### 阶段二：智能Space检测
1. **检测当前活跃应用**
   ```swift
   let runningApps = NSWorkspace.shared.runningApplications
   let frontmostApp = NSWorkspace.shared.frontmostApplication
   ```

2. **判断是否在全屏环境**
   ```swift
   func isCurrentSpaceFullscreen() -> Bool {
       // 检查当前是否有全屏窗口
       let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID)
       // 分析窗口信息确定全屏状态
   }
   ```

3. **动态调整窗口行为**
   ```swift
   if isCurrentSpaceFullscreen() {
       // 全屏环境下的特殊处理
       window?.collectionBehavior.insert(.fullScreenAuxiliary)
   }
   ```

### 阶段三：高级Space管理（可选）
1. **使用Accessibility API检测Space**
   ```swift
   let systemElement = AXUIElementCreateSystemWide()
   // 通过Accessibility获取当前Space信息
   ```

2. **监听Space变化通知**
   ```swift
   NSWorkspace.shared.notificationCenter.addObserver(
       forName: NSWorkspace.activeSpaceDidChangeNotification,
       object: nil,
       queue: .main
   ) { _ in
       // Space变化时的处理逻辑
   }
   ```

## 实施计划

### 第一步：测试当前配置效果
- 在不同Space中测试当前的`.canJoinAllSpaces + .fullScreenAuxiliary`组合
- 记录在各种场景下的窗口显示行为
- 收集用户反馈

### 第二步：优化CollectionBehavior
根据测试结果，尝试以下组合：
```swift
// 组合1：基础全屏支持
[.canJoinAllSpaces, .fullScreenAuxiliary]

// 组合2：添加忽略循环
[.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

// 组合3：全部可见
[.stationary]
```

### 第三步：添加智能检测
- 实现Space状态检测
- 根据当前环境动态调整窗口行为
- 添加用户偏好设置

### 第四步：高级功能（如果需要）
- 考虑使用私有API（仅限个人使用版本）
- 实现更精确的Space控制
- 添加多显示器支持

## 技术注意事项

### 1. macOS版本兼容性
不同macOS版本的Space行为可能有差异：
- macOS 10.15+: 支持所有现代CollectionBehavior
- 较老版本可能不支持某些属性

### 2. 全屏应用类型
不同类型的全屏应用行为不同：
- 原生全屏（绿色按钮）: 创建新Space
- 伪全屏（隐藏菜单栏）: 仍在原Space
- 游戏全屏: 可能有特殊行为

### 3. 性能考虑
- 避免频繁查询Space状态
- 缓存Space检测结果
- 使用异步处理避免阻塞UI

### 4. 用户体验
- 提供用户选项控制窗口行为
- 在设置中说明不同模式的区别
- 考虑添加快捷键切换模式

## 测试用例

### 基础测试
1. **桌面Space**: 双击Cmd+C → 窗口在桌面显示 ✓
2. **全屏IDEA Space**: 双击Cmd+C → 窗口在IDEA上方显示
3. **全屏Chrome Space**: 双击Cmd+C → 窗口在Chrome上方显示
4. **多个全屏Space**: 在不同Space间切换测试

### 边缘情况测试
1. **Space切换中**: 正在切换Space时触发快捷键
2. **多显示器**: 在不同显示器的不同Space中测试
3. **系统动画**: Mission Control动画进行中时触发
4. **系统重启**: 重启后Space配置变化

### 性能测试
1. **响应时间**: 从快捷键到窗口显示的延迟
2. **资源占用**: Space检测对系统性能的影响
3. **稳定性**: 长时间使用是否有内存泄漏

## 结论

推荐从**阶段一**开始实施，使用安全的系统API确保稳定性。当前的`.canJoinAllSpaces + .fullScreenAuxiliary`组合配合高窗口层级应该能解决大部分Space显示问题。

如果效果不理想，再逐步尝试更高级的方案。避免一开始就使用私有API，优先保证应用的稳定性和兼容性。

---

## 开发反思与经验总结

### 技术方案演进的深层启示

**1. 问题识别的重要性**
- **初始误解**：将Mission Control Spaces问题误认为是物理多显示器问题
- **教训**：问题的准确定义是解决方案的前提，表象往往掩盖本质
- **方法论**：需要系统性分析用户场景，而不是基于直觉做技术判断

**2. API组合的复杂性**
- **发现**：单一的NSWindowCollectionBehavior属性无法解决跨Space显示问题
- **成功方案**：NSPanel + Accessory策略 + CGShieldingWindowLevel的组合才是完整解决方案
- **启示**：系统级功能往往需要多个技术点的精确配合，不能期望单一API解决复杂问题

**3. 技术路线选择的风险评估**
- **私有API的诱惑**：CGSPrivate.h提供强大功能，但风险极高
- **成熟方案的价值**：基于社区经验的标准API组合更可靠
- **决策原则**：优先选择可维护、可审核、可升级的技术路线

### 我的技术能力反思

**1. 系统级开发经验不足**
- **表现**：对macOS的窗口系统和Space机制理解肤浅
- **后果**：在错误方向上尝试了大量无效方案
- **改进**：需要建立对操作系统核心机制的深入理解

**2. 问题分析方法有待提升**
- **错误模式**：看到现象就立即想解决方案，缺少系统分析
- **正确方法**：应该先深入理解问题本质，再寻找技术方案
- **实践建议**：复杂问题要画图分析，明确各组件的职责和关系

**3. 技术调研的系统性不够**
- **盲区**：没有及时研究成功案例（Rectangle、Hammerspoon等）
- **收获**：这些开源项目包含大量宝贵的实战经验
- **方法论**：遇到系统级问题，优先研究成功的开源实现

### 外部专家指导的关键价值

**1. 避免技术陷阱**
- **专家建议**：不要使用私有API，有更好的标准方案
- **价值**：避免了App Store审核风险和系统更新兼容性问题
- **启示**：专家经验能帮助规避许多隐性风险

**2. 提供成熟的技术方案**
- **专家方案**：NSPanel + Accessory + CGShieldingWindowLevel组合
- **技术来源**：基于社区多年实践总结的最佳实践
- **学习效果**：一次性获得了完整可靠的解决方案

**3. 建立正确的技术理念**
- **专家观点**：系统级开发要理解操作系统的设计意图
- **思维转变**：从"如何绕过限制"转向"如何正确使用系统功能"
- **长远价值**：建立了可持续的技术发展路径

### 具体技术经验总结

**1. macOS窗口系统的层次结构**
- **层级理解**：CGShieldingWindowLevel > .screenSaver > .modalPanel > .popUpMenu
- **应用场景**：不同层级适用于不同的用户交互需求
- **最佳实践**：选择最低满足需求的层级，避免过度使用高层级

**2. 应用激活策略的影响**
- **.regular**：正常应用，有Dock图标，会抢占焦点
- **.accessory**：辅助应用，可显示在其他应用的全屏Space上
- **.agent**：后台应用，完全隐形运行
- **组合使用**：动态切换策略可以获得最佳用户体验

**3. NSPanel vs NSWindow的选择**
- **NSWindow**：适用于主要界面，与其他应用平等竞争
- **NSPanel**：适用于辅助界面，可以浮在其他应用之上
- **关键差异**：Panel具有特殊的显示和交互特性

### 开发方法论的收获

**1. 分阶段实施的智慧**
- **阶段一**：使用安全的基础方案验证可行性
- **阶段二**：在基础方案上逐步增强功能
- **阶段三**：根据实际需求决定是否使用高级功能
- **价值**：避免了一开始就使用复杂危险的方案

**2. 测试用例的系统性设计**
- **基础测试**：覆盖主要使用场景
- **边缘案例测试**：考虑异常情况和系统状态变化
- **性能测试**：确保方案不会影响系统性能
- **重要性**：系统级功能的测试比普通应用更复杂

**3. 文档化的价值**
- **技术方案记录**：详细记录每个方案的原理和适用场景
- **失败经验总结**：记录为什么某些方案不可行
- **实施计划制定**：为后续开发提供清晰的路径
- **知识传承**：为团队和后续开发者提供参考

### 对未来开发的指导

**1. 系统级功能开发的基本原则**
- 优先研究操作系统的设计意图和标准做法
- 避免使用私有API和hack性质的解决方案
- 重视成熟社区方案和开源项目的经验
- 建立系统性的测试验证流程

**2. 技术方案选择的评估标准**
- **稳定性**：方案是否依赖稳定的公开API
- **兼容性**：是否能适应系统版本更新
- **可维护性**：代码是否易于理解和修改
- **用户体验**：是否符合操作系统的交互规范

**3. 知识积累的系统化**
- 建立对操作系统核心概念的深入理解
- 收集和整理系统级开发的最佳实践
- 关注社区动态和技术发展趋势
- 培养解决复杂技术问题的系统性思维

这个技术方案的制定和实施过程，不仅解决了具体的技术问题，更重要的是建立了系统级开发的方法论和技术理念，为后续类似项目提供了宝贵的经验基础。

---

*文档创建时间：2025年8月23日*
*当前实施状态：阶段一 - 基础配置已完成*