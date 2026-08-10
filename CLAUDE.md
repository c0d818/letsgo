# LetsGo 仓库说明

本仓库是一个 Claude Code 插件：**仓库根目录即插件根目录**。用途是把
Superpowers 式工程纪律与 OpenSpec 式生命周期管理缝合为 SDD 工作流。

## 结构

- `.claude-plugin/`：插件清单与市场配置
- `commands/`：斜杠命令，文件名即命令名
- `skills/`：技能，全部 `user-invocable: false`（只做按需读取/自动激活）
- `agents/`：5 个阶段 writer + 1 个通用 `lg:letsgo-reviewer`
- `hooks/hooks.json` + `scripts/`：运行时守卫（PreToolUse 权限门、
  SessionStart/UserPromptSubmit 上下文注入）
- `cli/` + `state/`：`letsgo` CLI 与状态机
- `lib/`：共享逻辑（路径、模板复制、守卫决策模块 `lib/guard.js`）
- `templates/`：`letsgo init` 安装到目标项目的模板
- `tests/`：`node --test`
- `docs/`：工作流、架构、路线图

## 三层编排

```text
commands/*.md（详细流程：逐阶段列出 Skill、校验门、subagent 编排）
  -> skills/*/SKILL.md（怎么做：阶段 Skill 派发 writer -> letsgo-reviewer）
  -> agents/*.md（执行：writer 干活，reviewer 只读审查）
```

## 关键约定

- 命令名 = 文件名（kebab-case），改名时同步 README、docs、templates/CLAUDE.md、
  测试和所有引用。
- 规划文档默认简体中文；代码、测试、用户文案沿用项目语言。
- 守卫只对存在 `openspec/` 的项目生效，其他项目完全放行。
- 阶段 Skill 负责派发 subagent，顺序固定：
  `<阶段>-writer -> letsgo-reviewer -> 主 Agent 校验并推进`。
- 新增钩子脚本放 `scripts/`，在 `hooks/hooks.json` 里注册，路径用
  `${CLAUDE_PLUGIN_ROOT}`。
- 运行问题由 `/lg:log` 命令记录到项目的 `openspec/.letsgo/issues.md`，守卫允许
  写入该文件。
- token 用量由 `/lg:tokens` 命令或 Stop 钩子统计到 `openspec/.letsgo/token-report.md`
  （解析 `~/.claude/projects/` 下的会话记录，按 `attributionAgent` 区分 subagent）。

## 开发

- 测试：`npm test`（CLI、状态机、守卫决策、钩子脚本 I/O）。
- 插件校验：`claude plugin validate .claude-plugin/plugin.json --strict`。
- `letsgo` CLI 已通过 `npm link` 全局可用，仓库改动即时生效。
- 插件组件改动需新开 Claude Code 会话生效。
- 发布流程见 `VERSIONING.md`，更新日志记入 `CHANGELOG.md`。
