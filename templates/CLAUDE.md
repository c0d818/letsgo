# Stitches 项目规则

本项目由 Stitches 管理。

初始化会在 `.claude/settings.json` 中把写操作权限设为询问模式，并预留 Context7
远程 MCP（`context7`）。CodeGraph 需要先在本机安装后再自行加入 MCP 配置。

## 语言规则

Stitches 的规划文档统一使用简体中文：

- `proposal.md`
- `design.md`
- `tasks.md`
- `verification.md`
- `archive.md`

代码注释、测试、面向用户的文案和普通项目文档，沿用项目现有语言；
除非用户明确要求，否则不要擅自切换语言。

开始较大范围的实现工作前，先阅读：

- `.claude/skills/stitches-workflow/SKILL.md`
- `.claude/skills/stitches-spec/SKILL.md`
- 澄清变更时阅读 `.claude/skills/stitches-clarify/SKILL.md`
- 创建新变更时阅读 `openspec/change-types/`

按需求类型选择 Stitches 命令：

1. `/start <change-id>`
2. `/bugfix <change-id>`
3. `/refactor <change-id>`
4. `/test <change-id>`

这些命令内部按顺序执行 `clarify -> design -> plan -> apply -> verify -> archive`，
用户不需要单独调用阶段命令。`/letsgo <change-id> [类型]` 一键自动走完整个
生命周期（工程维护类变更可用 `stitches new --type maintenance` 配合
`/letsgo` 处理）。`/structure` 查看项目结构，`/check <change-id>` 查看变更
状态。

使用 `stitches validate` 和 `stitches advance`，让
`openspec/changes/<change-id>/status.json` 与流程保持同步。
涉及行为变更时，不要跳过生命周期状态。

随时可以使用 `/check <change-id>` 查看当前阶段、已完成阶段和下一步。
