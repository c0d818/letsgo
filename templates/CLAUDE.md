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
2. `/lg:bugfix <修复需求描述>`
3. `/lg:refactor <change-id>`
4. `/lg:test <change-id>`

`/lg:start` 和 `/lg:bugfix` 会从描述中自动生成 change-id。所有场景命令内部按顺序
执行 `clarify -> design -> plan -> apply -> verify -> archive`，
用户不需要单独调用阶段命令。`/lg:letsgo <change-id> [类型]` 一键自动走完整个
生命周期（工程维护类变更可用 `letsgo new --type maintenance` 配合
`/lg:letsgo` 处理）。`/lg:structure` 查看项目结构，`/lg:check <change-id>` 查看变更
状态，`/lg:log <问题>` 记录运行中遇到的问题。
随时可以用 `/lg:tokens` 查看本次会话主代理和每个 subagent 的 token 用量，
报告保存在 `openspec/.letsgo/token-report.md`。

使用 `letsgo validate` 和 `letsgo advance`，让
`openspec/changes/<change-id>/status.json` 与流程保持同步。
涉及行为变更时，不要跳过生命周期状态。

插件会在 `openspec/.letsgo/runtime-state.json` 中覆盖记录当前阶段的 Skill 和
Subagent 状态。必须先完成阶段 Skill，再启动 writer；writer 完成后再启动
reviewer。writer 或 reviewer 的最后一行必须输出其定义中要求的
`LETGO_RESULT`，缺少运行证据时 `letsgo advance` 不会推进。

apply 阶段必须读取 `letsgo-tdd`，对每个行为任务固定执行
`RED -> GREEN -> REFACTOR`，并把真实命令和结果记录到
`openspec/changes/<change-id>/tdd-evidence.md`。只有纯文档、注释、模板、仅测试或
其他不改变生产行为的修改可以记录理由后豁免；缺少有效证据不得推进 verify。

随时可以使用 `/lg:check <change-id>` 查看当前阶段、已完成阶段和下一步。
