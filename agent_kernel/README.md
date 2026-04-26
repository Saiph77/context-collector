# Agent Kernel

完整的 Agent 内核实现，整合了 s01-s11 的所有 harness 机制。

## 核心特性

### 已实现的机制 (s01-s11)

1. **s01: Agent Loop** - 基础的 while 循环 + stop_reason + 工具调度
2. **s02: Tool Dispatch** - 工具分发映射模式
3. **s03: Todo Manager** - 轻量级任务追踪（内存中）
4. **s04: Subagent** - 上下文隔离的子代理
5. **s05: Skill Loading** - 按需加载专业知识
6. **s06: Context Compression** - 三层压缩策略（微压缩 + 自动压缩）
7. **s07: Task System** - 基于文件的持久化任务系统
8. **s08: Background Tasks** - 后台任务管理 + 通知队列
9. **s09: Message Bus** - JSONL 邮箱系统，多代理消息传递
10. **s10: Protocols** - 请求-响应协议（shutdown、plan approval）
11. **s11: Autonomous Agents** - 自主代理，空闲轮询 + 自动认领任务

## 快速开始

### 1. 自动设置（推荐）

```bash
# 运行设置脚本
./setup.sh

# 编辑 .env 文件，填入你的 API 密钥
# ANTHROPIC_API_KEY=sk-ant-xxx
# MODEL_ID=claude-sonnet-4-6
```

### 2. 手动设置

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件
```

### 3. 运行 Agent

```bash
# 直接运行
python agent_kernel.py

# 或使用服务器模式（用于 cc-ts 集成）
python server.py
```

## 目录结构

```
agent_kernel/
├── agent_kernel.py       # 核心 Agent 实现
├── server.py             # HTTP 服务器（用于 cc-ts 集成）
├── requirements.txt      # Python 依赖
├── .env.example          # 环境变量模板
├── setup.sh             # 自动设置脚本
├── start_server.sh      # 启动服务器脚本
├── README.md            # 本文件
├── INTEGRATION.md       # 集成指南
├── CHANGELOG.md         # 变更日志
├── skills/              # 技能库
└── examples/            # 使用示例
```

## 核心工具列表（24 个）

### 基础工具 (4 个)
- `bash` - 执行 shell 命令
- `read_file` - 读取文件
- `write_file` - 写入文件
- `edit_file` - 精确文本替换

### 任务管理 (6 个)
- `TodoWrite` - 更新待办列表（内存中）
- `task_create/get/update/list` - 持久化任务系统（文件）
- `claim_task` - 认领任务

### 代理协作 (4 个)
- `task` - 生成子代理（上下文隔离）
- `spawn_teammate` - 生成自主队友
- `list_teammates` - 列出团队成员
- `idle` - 进入空闲状态

### 消息系统 (4 个)
- `send_message` - 发送消息给队友
- `read_inbox` - 读取收件箱
- `broadcast` - 广播给所有队友
- `shutdown_request` - 请求队友关闭

### 知识与上下文 (2 个)
- `load_skill` - 加载技能文档
- `compress` - 手动压缩对话上下文

### 后台任务 (2 个)
- `background_run` - 后台执行命令
- `check_background` - 检查后台任务状态

### 协议工具 (2 个)
- `plan_approval` - 计划审批
- `shutdown_response` - 关闭响应

## 使用场景

### 1. 单代理模式

```python
from agent_kernel import agent_loop

messages = [{"role": "user", "content": "帮我分析这个项目的代码结构"}]
agent_loop(messages)
```

### 2. 团队协作模式

```python
# 在 agent_kernel.py 的 REPL 中：
# 1. 创建任务
> 创建 3 个任务：实现登录、实现注册、写测试

# 2. 生成队友
> 生成两个队友：coder 负责编码，tester 负责测试

# 3. 队友会自动认领任务并工作
```

### 3. HTTP 服务器模式（用于 cc-ts）

```bash
# 启动服务器
./start_server.sh

# 服务器提供以下端点：
# GET  /health              - 健康检查
# POST /agent/stream        - 流式对话
```

## 技能系统

技能是按需加载的专业知识文档，格式为：

```markdown
---
name: skill-name
description: Brief description
---

# Skill Content
[Detailed knowledge, patterns, examples...]
```

### 可用技能

1. **code-review** - 代码审查专家（安全、性能、可维护性）
2. **agent-builder** - Agent 构建指南
3. **mcp-builder** - MCP 服务器开发
4. **pdf** - PDF 处理和分析

### 使用技能

```python
# 在对话中：
> 加载 code-review 技能，然后审查 auth.py 文件
```

## 集成到你的项目

参见 `INTEGRATION.md` 获取详细的集成指南，包括：
- 3 种集成模式（独立服务、Python 库、嵌入式）
- 自定义工具、技能、权限
- 监控、日志、多租户
- 测试、部署建议

## 文件清单

### 核心文件
- **agent_kernel.py** (753 行) - 核心 Agent 实现
- **server.py** - HTTP 服务器
- **requirements.txt** - Python 依赖
- **.env.example** - 环境变量模板
- **setup.sh** / **start_server.sh** - 脚本

### 文档
- **README.md** - 本文件
- **INTEGRATION.md** - 集成指南
- **CHANGELOG.md** - 变更日志

### 技能库 (skills/)
- code-review/SKILL.md - 代码审查技能
- agent-builder/SKILL.md - Agent 构建指南
- mcp-builder/SKILL.md - MCP 服务器开发
- pdf/SKILL.md - PDF 处理

### 示例代码 (examples/)
- example_basic.py - 基础使用示例（8 个示例）
- example_team.py - 团队协作示例（8 个示例）
- example_tasks.py - 任务系统示例（10 个示例）

### 运行时生成的目录
- `.tasks/` - 持久化任务文件
- `.team/` - 团队配置和邮箱
- `.transcripts/` - 压缩的对话记录

## 限制和注意事项

### 这是教学实现，不是生产框架

- ✅ 用于学习 harness 工程模式
- ✅ 用于原型验证和实验
- ❌ 不适合直接用于生产环境
- ❌ 缺少完整的错误恢复、监控、安全沙箱

### 缺失的生产特性

- 完整的事件/hook 总线
- 基于规则的权限治理
- 会话生命周期控制（resume/fork）
- 高级错误恢复机制
- 性能监控和日志系统
- 资源限制和沙箱

### 生产级实现

如需生产级 Agent 框架，参考：
- **Kode Agent CLI** - 生产就绪的编码代理
- **Kode Agent SDK** - 可嵌入的代理库
- **claw0** - 常驻 Agent harness

## 哲学

> **模型就是代理，代码就是 harness。**
>
> Agent 是经过训练的神经网络，能够感知、推理和行动。
> 你作为 harness 工程师的工作是构建智能体所处的世界：
> - 实现工具（给代理双手）
> - 整理知识（给代理专业能力）
> - 管理上下文（给代理清晰的记忆）
> - 控制权限（给代理边界）
>
> **构建优秀的 harness，代理会完成剩下的工作。**

## 许可证

本项目基于 learn-claude-code 教学项目，遵循相同的开源许可证。

## 支持

- 原项目：https://github.com/shareAI-lab/learn-claude-code
- 问题反馈：提交 Issue 到原项目仓库
