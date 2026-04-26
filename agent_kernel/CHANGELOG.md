# Changelog

## [1.0.0] - 2026-03-25

### Initial Release

完整的 Agent Kernel 实现，整合 s01-s11 机制。

#### 核心机制 (s01-s11)

- **s01**: Agent Loop - 基础循环 + stop_reason
- **s02**: Tool Dispatch - 工具分发映射
- **s03**: Todo Manager - 轻量级任务追踪
- **s04**: Subagent - 上下文隔离的子代理
- **s05**: Skill Loading - 按需加载技能
- **s06**: Context Compression - 三层压缩策略
- **s07**: Task System - 持久化任务系统
- **s08**: Background Tasks - 后台任务管理
- **s09**: Message Bus - JSONL 邮箱系统
- **s10**: Protocols - 请求-响应协议
- **s11**: Autonomous Agents - 自主代理

#### 核心工具 (24 个)

- 基础工具: bash, read_file, write_file, edit_file
- 任务管理: TodoWrite, task_create/get/update/list, claim_task
- 代理协作: task, spawn_teammate, list_teammates, idle
- 消息系统: send_message, read_inbox, broadcast, shutdown_request
- 知识与上下文: load_skill, compress
- 后台任务: background_run, check_background
- 协议: plan_approval, shutdown_response

#### 技能库 (4 个)

- code-review - 代码审查专家
- agent-builder - Agent 构建指南
- mcp-builder - MCP 服务器开发
- pdf - PDF 处理

#### HTTP 服务器

- SSE 流式对话端点
- 健康检查端点
- 上下文文件支持

#### 文档

- README.md - 项目概述
- INTEGRATION.md - 集成指南
- CHANGELOG.md - 本文件

#### 示例代码

- example_basic.py - 基础使用示例
- example_team.py - 团队协作示例
- example_tasks.py - 任务系统示例

---

## 未包含的机制

- **s12**: Worktree Isolation - Git worktree 隔离（独立教学主题）

---

## 基于

本项目基于 [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 的 `s_full.py` 移植。
