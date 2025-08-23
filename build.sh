#!/bin/bash

echo "🔨 构建 Context Collector (新版本)..."

# 进入源码目录
cd "$(dirname "$0")"

# 创建应用包结构
mkdir -p "Context Collector.app/Contents/MacOS"
mkdir -p "Context Collector.app/Contents/Resources"

# 编译所有Swift文件
echo "📦 编译Swift源码..."
swiftc -o "Context Collector.app/Contents/MacOS/ContextCollector" \
    Sources/ClipboardService.swift \
    Sources/StorageService.swift \
    Sources/HotkeyService.swift \
    Sources/Views/AdvancedTextEditor.swift \
    Sources/Views/ProjectComponents.swift \
    Sources/Views/NewProjectDialog.swift \
    Sources/Views/CaptureWindow.swift \
    Sources/main.swift

if [ $? -eq 0 ]; then
    # 创建Info.plist
    cat > "Context Collector.app/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>ContextCollector</string>
    <key>CFBundleIdentifier</key>
    <string>com.contextcollector.new.app</string>
    <key>CFBundleName</key>
    <string>Context Collector</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>4.0</string>
    <key>CFBundleVersion</key>
    <string>4</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSAccessibilityUsageDescription</key>
    <string>Context Collector needs accessibility permissions to capture keyboard shortcuts for quick text collection.</string>
    <key>NSAppleEventsUsageDescription</key>
    <string>Context Collector needs permission to access clipboard content for text collection.</string>
</dict>
</plist>
EOF

    echo "✅ 构建成功！"
    echo "📱 应用路径: $(pwd)/Context Collector.app"
    echo ""
    echo "🚀 启动测试:"
    echo "   open 'Context Collector.app'"
    echo ""
    echo "⚠️  如需全局快捷键，请授权辅助功能权限"
else
    echo "❌ 构建失败！"
    exit 1
fi