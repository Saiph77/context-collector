# cc-py Agent Best Practices

## 目标与范围
本文记录 `cc-py`（PySide6 + pyobjc）在实现“全局双击 `Cmd+C` 唤起全屏可见浮层”过程中的关键踩坑与最终可用方案，供后续迭代直接复用。

## 最终稳定方案（结论）
1. 全局输入监听使用 `Quartz.CGEventTap`，仅监听 `kCGEventKeyDown`。
2. 面板显示使用 Qt 窗口 + pyobjc 提升到 Cocoa 高层级窗口。
3. Space 策略优先使用 `MoveToActiveSpace + FullScreenAuxiliary`，不要与 `CanJoinAllSpaces` 同时设置。
4. `Cmd+S/Cmd+W` 使用“双层兜底”：Qt Shortcut + 全局事件监听回调。
5. 隐藏后重新唤起时重建面板实例，降低旧 Space 绑定导致的跳桌面风险。
6. 启用单实例锁，避免多进程并存导致双窗口、快捷键冲突。

## 关键踩坑与修复

### 1) CollectionBehavior 互斥崩溃
- 现象：程序抛出 `NSInternalInconsistencyException`。
- 根因：`NSWindowCollectionBehaviorCanJoinAllSpaces` 与 `NSWindowCollectionBehaviorMoveToActiveSpace` 互斥。
- 修复：在行为列表中分级尝试，命中一个即停止，不混用互斥位。

### 2) 双窗口/行为异常
- 现象：双击一次出现两个窗口，快捷键偶发失效。
- 根因：机器上残留多个 `python -m cc_py.app` 进程。
- 修复：`fcntl.flock` 文件锁实现单实例；启动前建议清理旧进程。

### 3) Cmd 快捷键不稳定
- 现象：`Cmd+S` / `Cmd+W` 在部分焦点状态无效。
- 根因：仅依赖 Qt 焦点链的 Shortcut 不够稳。
- 修复：保留 Qt 快捷键，同时在全局事件回调中增加 `Cmd+S/W`（仅面板可见时生效）。

### 4) 全屏/多桌面唤起跳主桌面
- 现象：在其他全屏桌面触发，面板跳回主页面。
- 修复：
  - 以鼠标所在屏幕计算位置。
  - 窗口行为优先 `MoveToActiveSpace`。
  - 隐藏后重建面板实例再显示。

## 运行与验收流程
1. 进入目录：`cd /Users/saiph/Downloads/context-collector/cc-py`
2. 清理旧进程：`pkill -f "cc_py.app" || true`
3. 启动：`./run.sh`
4. 验收：
   - 双击 `Cmd+C` 只唤起一个窗口
   - 全屏桌面内直接浮起
   - `Cmd+S` 保存并关闭、`Cmd+W` 关闭

## 排障命令
- 看残留进程：`pgrep -fal "cc_py.app"`
- 语法检查：`python3.13 -m py_compile src/cc_py/*.py`
- 存储测试：`PYTHONPATH=src python3.13 -m unittest tests/test_storage.py`

## 代码来源（可验证）
- 热键监听：`src/cc_py/hotkey.py`
- 单实例与主流程：`src/cc_py/app.py`
- 面板层级/Space 行为：`src/cc_py/panel_bridge.py`
- 面板快捷键与鼠标定位：`src/cc_py/ui.py`
