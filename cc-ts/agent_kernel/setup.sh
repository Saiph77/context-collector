#!/bin/bash
# Agent Kernel 快速设置脚本

set -e

echo "================================"
echo "Agent Kernel 快速设置"
echo "================================"
echo ""

# 检查Python版本
echo "[1/5] 检查Python版本..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到python3"
    echo "请先安装Python 3.11或更高版本"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✓ 找到Python $PYTHON_VERSION"

# 创建虚拟环境
echo ""
echo "[2/5] 创建虚拟环境..."
if [ -d "venv" ]; then
    echo "虚拟环境已存在，跳过创建"
else
    python3 -m venv venv
    echo "✓ 虚拟环境创建成功"
fi

# 激活虚拟环境
echo ""
echo "[3/5] 激活虚拟环境..."
source venv/bin/activate
echo "✓ 虚拟环境已激活"

# 安装依赖
echo ""
echo "[4/5] 安装依赖..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt
echo "✓ 依赖安装完成"

# 配置环境变量
echo ""
echo "[5/5] 配置环境变量..."
if [ -f ".env" ]; then
    echo ".env文件已存在，跳过创建"
else
    cp .env.example .env
    echo "✓ 已创建.env文件"
    echo ""
    echo "⚠️  请编辑.env文件，填入你的API密钥："
    echo "   ANTHROPIC_API_KEY=sk-ant-xxx"
    echo "   MODEL_ID=claude-sonnet-4-6"
fi

# 创建必要的目录
mkdir -p .tasks .team .transcripts

echo ""
echo "================================"
echo "✓ 设置完成！"
echo "================================"
echo ""
echo "下一步："
echo "  1. 编辑.env文件，填入你的API密钥"
echo "  2. 激活虚拟环境: source venv/bin/activate"
echo "  3. 运行agent: python agent_kernel.py"
echo ""
echo "或者运行示例："
echo "  python examples/example_basic.py"
echo "  python examples/example_team.py"
echo "  python examples/example_tasks.py"
echo ""
echo "查看文档："
echo "  cat README.md"
echo "  cat INTEGRATION_GUIDE.md"
echo ""
