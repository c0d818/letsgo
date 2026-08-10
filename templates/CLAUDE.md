# LetsGo 项目规则

本项目由 LetsGo 管理。

LetsGo 插件会提供 Context7 远程 MCP（`context7`），写操作由插件守卫按阶段
管理。CodeGraph 需要先在本机安装后再自行加入 MCP 配置。

## 语言规则

LetsGo 的规划文档统一使用简体中文：

- `proposal.md`
- `design.md`
- `tasks.md`
- `verification.md`
- `archive.md`

代码注释、测试、面向用户的文案和普通项目文档，沿用项目现有语言；
除非用户明确要求，否则不要擅自切换语言。

开始较大范围的实现工作前，先阅读：

- `.claude/skills/letsgo-workflow/SKILL.md`
- `.claude/skills/letsgo-spec/SKILL.md`
- 澄清变更时阅读 `.claude/skills/letsgo-clarify/SKILL.md`
- 创建新变更时阅读 `openspec/change-types/`

按需求类型选择 LetsGo 命令：

1. `/lg:start <需求描述>`
2. `/lg:bugfix <change-id>`
3. `/lg:refactor <change-id>`
4. `/lg:test <change-id>`

这些命令内部按顺序执行 `clarify -> design -> plan -> apply -> verify -> archive`，
用户不需要单独调用阶段命令。`/lg:letsgo <change-id> [类型]` 一键自动走完整个
生命周期（工程维护类变更可用 `letsgo new --type maintenance` 配合
`/lg:letsgo` 处理）。`/lg:structure` 查看项目结构，`/lg:check <change-id>` 查看变更
状态，`/lg:log <问题>` 记录运行中遇到的问题。
随时可以用 `/lg:tokens` 查看本次会话主代理和每个 subagent 的 token 用量，
报告保存在 `openspec/.letsgo/token-report.md`。

使用 `letsgo validate` 和 `letsgo advance`，让
`openspec/changes/<change-id>/status.json` 与流程保持同步。
涉及行为变更时，不要跳过生命周期状态。

随时可以使用 `/lg:check <change-id>` 查看当前阶段、已完成阶段和下一步。
