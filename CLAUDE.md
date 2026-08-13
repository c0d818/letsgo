# LetsGo 仓库说明

本仓库是一个 Claude Code 插件：**仓库根目录即插件根目录**。用途是把
Superpowers 式工程纪律与 OpenSpec 式生命周期管理缝合为 SDD 工作流。

## 结构

- `.claude-plugin/`：插件清单与市场配置
- `.mcp.json`：Context7 远程文档与 CodeGraph 本地代码图谱 MCP
- `commands/`：斜杠命令，文件名即命令名
- `skills/`：技能，全部 `user-invocable: false`（只做按需读取/自动激活）
- `agents/`：5 个阶段 writer + 1 个通用 `lg:letsgo-reviewer`
- `hooks/hooks.json` + `scripts/`：运行时守卫、上下文恢复及权限/压缩指标采集
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
- Skill Hook 只表示 Skill 已加载；阶段是否完成由产物校验、writer/reviewer 的
  `LETGO_RESULT` 证据和 `advance` 共同决定。
- Subagent 说明用精简中文，文件路径、命令、错误和最后一行英文 JSON 协议保持原样。
- 存在有限选项时主 Agent 必须调用 `AskUserQuestion`；只有无法合理枚举的自由文本才
  普通提问。Subagent 不直接询问用户，只把阻塞问题与候选选项交回主 Agent。
- 新增钩子脚本放 `scripts/`，在 `hooks/hooks.json` 里注册，路径用
  `${CLAUDE_PLUGIN_ROOT:-${CODEAGENT3_PLUGIN_ROOT}}` 并引用完整脚本路径。
- 运行问题由 `/lg:log` 命令记录到项目的 `openspec/.letsgo/issues.md`，守卫允许
  写入该文件。
- token 用量由 `/lg:tokens` 命令或 Stop 钩子覆盖写入最新报告，合并同类 Subagent
  并按阶段时间窗计算增量。
- `runtime-state.json` 只保存当前阶段门禁；`run-summary.json` 覆盖保存本次生命周期
  阶段摘要和轻量指标。中断后使用 `letsgo recover`，不得通过新建维护变更绕过守卫。
- 后期审查发现遗漏时，只有用户明确授权才能用 `letsgo reopen` 回到更早阶段；旧审查
  证据必须保留，不得直接推进、手改状态或另建变更掩盖验收缺口。
- reviewer 两轮仍阻塞时展示第二轮 `blocking`，禁止手动批准产物；用户授权后可用
  `letsgo reopen` 重开当前审查周期，旧审查结果必须保留。
- 正常退出、重启、压缩或模型切换后使用 `letsgo continue` 保留有效阶段证据并显式
  交给新 session；`letsgo recover` 只用于损坏或幽灵状态，不能代替正常续跑。

## 开发

- 测试：`npm test`（CLI、状态机、守卫决策、钩子脚本 I/O）。
- 插件校验：`claude plugin validate .claude-plugin/plugin.json --strict`。
- `letsgo` CLI 已通过 `npm link` 全局可用，仓库改动即时生效。
- 插件组件改动需新开 Claude Code 会话生效。
- 大型代码分析优先使用 `codegraph_explore`；首次使用前在仓库根运行
  `codegraph init`，`.codegraph/` 只保留在本机。
- 发布流程见 `VERSIONING.md`，更新日志记入 `CHANGELOG.md`。
