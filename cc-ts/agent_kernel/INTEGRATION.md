# Agent Kernel 集成指南

本文档描述如何将 Agent Kernel 集成到你的项目中，包括 Context Collector (cc-ts) 的集成架构。

## 目录

1. [cc-ts 集成架构](#cc-ts-集成架构)
2. [通用集成模式](#通用集成模式)
3. [HTTP 服务器模式](#http-服务器模式)
4. [自定义工具和技能](#自定义工具和技能)
5. [测试和部署](#测试和部署)

---

## cc-ts 集成架构

Context Collector 使用 HTTP + SSE 流式通信模式集成 Agent Kernel。

### 架构图

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  React Renderer │ ◄─SSE─► │ Electron Main    │ ◄─HTTP─► │ Python Agent    │
│  (panel.tsx)    │         │ (main.ts)        │         │ Server          │
│                 │         │                  │         │ (server.py)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
       │                            │                            │
       │ User sends message         │                            │
       ├───────────────────────────►│                            │
       │                            │ POST /agent/stream         │
       │                            ├───────────────────────────►│
       │                            │                            │
       │                            │ ◄─── SSE chunks ───────────┤
       │ ◄── agent:stream-chunk ────┤                            │
       │                            │                            │
       │ (render chunks in real-time)                            │
```

### 组件说明

#### 1. Python Agent Server (`server.py`)

**位置**: `agent_kernel/server.py`

**端点**:
- `GET /health` - 健康检查
- `POST /agent/stream` - SSE 流式对话端点

**配置** (`.env`):
```bash
ANTHROPIC_API_KEY=sk-ant-xxx
MODEL_ID=claude-sonnet-4-6
AGENT_SERVER_PORT=5678
```

#### 2. Electron Main Process (`main.ts`)

**IPC 处理器**:
- `panel:send-agent-message-stream` - 接收渲染进程请求，从 Python 服务器获取 SSE 流，转发到渲染进程

**事件发射**:
- `agent:stream-chunk` - 发送流式数据块到渲染进程

#### 3. React Renderer (`panel.tsx`)

**API 使用**:
```typescript
window.ccApi.sendAgentMessageStream(
  { message, contextFiles },
  () => {}
);

window.ccApi.onAgentStreamChunk((chunk) => {
  if (chunk.type === 'chunk') {
    // 追加到消息
  } else if (chunk.type === 'done') {
    // 完成
  } else if (chunk.type === 'error') {
    // 错误处理
  }
});
```

### 快速启动

```bash
# 1. 启动 Agent 服务器
cd agent_kernel
./start_server.sh

# 2. 启动 Electron 应用
npm run start:fresh

# 3. 打开面板（双击 Cmd+C）
# 4. 显示 Agent 聊天（Cmd+Alt+B）
```

### SSE 协议

#### 请求格式

```json
POST /agent/stream
Content-Type: application/json

{
  "message": "User message",
  "contextFiles": [
    {
      "path": "/path/to/file.md",
      "content": "file content",
      "previewKind": "markdown"
    }
  ]
}
```

#### 响应格式 (SSE)

```
data: {"type": "chunk", "content": "Hello"}

data: {"type": "chunk", "content": " world"}

data: {"type": "done", "timestamp": null}
```

**数据块类型**:
- `chunk` - 文本内容块
- `done` - 流式传输完成
- `error` - 发生错误

---

## 通用集成模式

### 模式 1: 独立服务

将 Agent Kernel 作为独立进程运行，通过 HTTP API 或消息队列通信。

```python
# your_project/agent_service.py
import sys
sys.path.append('path/to/agent_kernel')

from agent_kernel import agent_loop, SYSTEM, TOOLS, MODEL, client

class AgentService:
    def __init__(self):
        self.history = []

    def process_request(self, user_query: str) -> str:
        """处理单个用户请求"""
        self.history.append({"role": "user", "content": user_query})
        agent_loop(self.history)

        # 提取响应
        last_msg = self.history[-1]
        if isinstance(last_msg["content"], list):
            response = "".join(
                block.text for block in last_msg["content"]
                if hasattr(block, "text")
            )
        else:
            response = last_msg["content"]

        return response

    def reset(self):
        """重置会话"""
        self.history = []

# 使用示例
service = AgentService()
result = service.process_request("分析这个项目的架构")
print(result)
```

### 模式 2: Python 库

直接导入核心组件，自定义工具和行为。

```python
# your_project/custom_agent.py
import sys
sys.path.append('path/to/agent_kernel')

from agent_kernel import (
    client, MODEL,
    TodoManager, SkillLoader, TaskManager,
    BackgroundManager, MessageBus, TeammateManager,
    run_bash, run_read, run_write, run_edit
)

class CustomAgent:
    def __init__(self, workdir):
        self.workdir = workdir
        self.todo = TodoManager()
        self.skills = SkillLoader(workdir / "skills")
        self.tasks = TaskManager()
        self.bg = BackgroundManager()

        # 自定义系统提示
        self.system = f"""
        你是一个自定义 Agent，工作目录：{workdir}
        你有以下技能：{self.skills.descriptions()}
        """

        # 自定义工具
        self.tools = self._build_tools()
        self.handlers = self._build_handlers()

    def _build_tools(self):
        return [
            {"name": "bash", "description": "Run command", ...},
            {"name": "custom_tool", "description": "Your tool", ...},
        ]

    def _build_handlers(self):
        return {
            "bash": lambda **kw: run_bash(kw["command"]),
            "custom_tool": lambda **kw: self.custom_handler(**kw),
        }

    def run(self, messages):
        # 自定义 agent 循环逻辑
        pass
```

### 模式 3: 嵌入式

将 Agent 嵌入到现有应用中。

```python
# your_app/main.py
from agent_kernel import agent_loop

class MyApp:
    def __init__(self):
        self.agent_history = []

    def handle_user_input(self, user_input: str):
        # 添加用户输入
        self.agent_history.append({
            "role": "user",
            "content": user_input
        })

        # 运行 agent
        agent_loop(self.agent_history)

        # 获取响应
        return self.agent_history[-1]["content"]
```

---

## HTTP 服务器模式

Agent Kernel 提供了内置的 HTTP 服务器，支持 SSE 流式传输。

### 启动服务器

```bash
cd agent_kernel
./start_server.sh
```

服务器将在 `http://127.0.0.1:5678` 启动。

### 端点

#### GET /health

健康检查端点。

**响应**:
```json
{
  "status": "ok",
  "model": "claude-sonnet-4-6"
}
```

#### POST /agent/stream

流式对话端点。

**请求**:
```json
{
  "message": "你好",
  "contextFiles": []
}
```

**响应**: SSE 流

```
data: {"type": "chunk", "content": "你"}
data: {"type": "chunk", "content": "好"}
data: {"type": "done", "timestamp": null}
```

### 客户端示例

#### Python

```python
import requests

response = requests.post(
    'http://127.0.0.1:5678/agent/stream',
    json={
        'message': '你好',
        'contextFiles': []
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))
```

#### JavaScript (Node.js)

```javascript
const fetch = require('node-fetch');

async function streamAgent(message) {
  const response = await fetch('http://127.0.0.1:5678/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contextFiles: [] })
  });

  const reader = response.body;
  reader.on('data', chunk => {
    console.log(chunk.toString());
  });
}

streamAgent('你好');
```

---

## 自定义工具和技能

### 添加自定义工具

```python
# 在 agent_kernel.py 中添加

def run_custom_tool(param1: str, param2: int) -> dict:
    """自定义工具实现"""
    result = f"处理 {param1} 和 {param2}"
    return {"result": result}

# 添加到 TOOLS 列表
TOOLS.append({
    "name": "custom_tool",
    "description": "自定义工具描述",
    "input_schema": {
        "type": "object",
        "properties": {
            "param1": {"type": "string", "description": "参数1"},
            "param2": {"type": "integer", "description": "参数2"}
        },
        "required": ["param1", "param2"]
    }
})

# 添加到 handlers
handlers["custom_tool"] = run_custom_tool
```

### 添加自定义技能

创建 `skills/your-skill/SKILL.md`:

```markdown
---
name: your-skill
description: 你的技能描述
---

# 技能内容

详细的知识、模式、示例...
```

---

## 测试和部署

### 测试 Agent 服务器

```bash
cd agent_kernel
source venv/bin/activate
python3 test_server.py
```

### 集成测试

```bash
# 运行集成测试
./scripts/dev.sh test

# 运行演示
./scripts/dev.sh demo
```

### 故障排查

#### 服务器无法启动

**检查**:
1. 端口 5678 未被占用: `lsof -i :5678`
2. Python 依赖已安装: `pip list | grep -E 'anthropic|flask'`
3. API 密钥有效: 检查 `.env` 文件

#### UI 无响应

**检查**:
1. Agent 服务器运行中: `curl http://127.0.0.1:5678/health`
2. 浏览器控制台错误: 打开 DevTools (Cmd+Opt+I)
3. 主进程日志: 检查 Electron 运行的终端

#### 流式传输中断

**检查**:
1. API 密钥额度充足
2. 网络连接正常
3. 服务器日志错误信息

### 环境变量

**Electron 主进程**:
- `AGENT_SERVER_URL` - Agent 服务器地址（默认: `http://127.0.0.1:5678`）

**Python 服务器**:
- `ANTHROPIC_API_KEY` - Claude API 密钥（必需）
- `MODEL_ID` - 使用的模型（默认: `claude-sonnet-4-6`）
- `AGENT_SERVER_PORT` - 服务器端口（默认: `5678`）
- `ANTHROPIC_BASE_URL` - 第三方提供商地址（可选）

---

## 生产部署建议

### 安全性

- 使用环境变量管理 API 密钥
- 启用 HTTPS/TLS
- 实现请求速率限制
- 添加身份验证和授权

### 可靠性

- 实现错误重试机制
- 添加健康检查
- 配置日志记录
- 监控资源使用

### 性能

- 使用连接池
- 实现请求队列
- 考虑缓存策略
- 优化上下文大小

---

## 相关资源

- [README.md](README.md) - 项目概述
- [CHANGELOG.md](CHANGELOG.md) - 变更日志
- [原项目](https://github.com/shareAI-lab/learn-claude-code)
