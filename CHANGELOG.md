# 更新日志

LetsGo 的所有重要变更都记录在这里。

格式遵循 Keep a Changelog 风格的分节，版本在 1.0 之前遵循语义化版本。

## [未发布]

### 变更

- `/lg:bugfix` 改为接收针对项目的修复需求描述，并由代理自动生成唯一的
  change-id；用户不再需要预先提供变更 ID。
- apply 阶段固定执行 RED -> GREEN -> REFACTOR，并新增 `tdd-evidence.md` 门禁；
  行为任务缺少完整 TDD 证据或非行为修改缺少有效豁免时不能推进 verify。
- 所有 Skill 和 Subagent 统一使用“职责、输入、执行流程、输出、边界”模板，
  并增加自动结构检查，防止后续写法漂移。
- 新增单文件轻量运行前检查：通过 Hook 记录当前阶段的 Skill、writer 和 reviewer
  状态，并在 Agent 启动及 `advance` 前强制检查正确顺序。
- 接入 CodeGraph 本地 MCP；大型项目 clarify 阶段优先用单一
  `codegraph_explore` 获取源码、调用路径和影响范围，索引不可用时自动降级。
- `letsgo doctor` 新增 CodeGraph CLI、索引和整体就绪状态检查。

### 修复

- 为 `SessionStart`、`UserPromptSubmit` 和 `PreToolUse` Hook 输出补齐 Claude Code
  要求的 `hookEventName`，恢复生命周期上下文注入和运行时守卫决策。

## [0.3.0] - 2026-08-10

### 变更

- 项目、npm 包、CLI、插件、技能、代理和运行时状态目录统一从旧名称重命名为
  `LetsGo`/`letsgo`。
- 斜杠命令统一为 `/lg:letsgo`、`/lg:start`、`/lg:bugfix`、`/lg:refactor`、
  `/lg:test`、`/lg:structure`、`/lg:check`、`/lg:log` 和 `/lg:tokens`。
- Node 命令采用 balanced 守卫：自动放行版本、帮助、语法检查和测试命令，并在
  `apply`/`verify` 阶段放行项目内相对路径脚本；任意代码、越界路径和 shell
  串联操作继续请求批准。

## [0.2.0] - 2026-08-08

### 变更

- 把 LetsGo 重新定位为 Claude Code 插件：仓库根目录现在是插件根目录，带有
  `.claude-plugin/plugin.json` 和 `marketplace.json`。
- 把斜杠命令、技能、代理和模板从 OpenCode 布局移植到 Claude Code 约定
  （YAML frontmatter、`CLAUDE.md`、`.claude/` 项目内安装目标）。
- 用 Claude Code 钩子替换 OpenCode 运行时守卫钩子：`PreToolUse` 权限门加上
  `SessionStart`/`UserPromptSubmit` 上下文注入，底层仍是同一套状态感知写决策
  模块。
- 用文件化的活跃变更跟踪替换内存会话上下文：`letsgo select <change-id>`
  写入 `openspec/.letsgo/active.json`，只有一个活跃变更时守卫自动回退使用。
- MCP 配置现在位于 `.mcp.json`（Context7 远程 MCP）。
- 守卫只在有 `openspec/` 目录的项目里启用，其他项目完全放行。
- 全部用户可见文案、文档和模板统一为简体中文。

### 移除

- OpenCode 插件入口、`plugin/opencode.json`、OpenCode 钩子适配器、`ocss`
  启动器、`@opencode-ai/plugin` 依赖，以及 `AGENTS.md`/`opencode.json` 安装
  模板。

### 已知问题

- 运行时守卫决策依赖 Claude Code 工具输入形状，采集真实钩子轨迹后可能需要
  进一步细化。

## [0.1.0] - 2026-07-31

### 新增

- CLI SDD 状态机命令：`new`、`status`、`validate`、`advance`。
- `openspec/changes/<change-id>/status.json` 中的变更状态跟踪。
- 乱序推进保护，变更不能跳过当前状态。
- 首个运行时守卫：系统提示状态注入和状态范围写权限决策。
- `feature`、`bugfix`、`refactor`、`test`、`maintenance` 的 OpenSpec 变更类型
  模板。
- `letsgo new --type <type>` 创建工作区，包含 `proposal.md`、`design.md`、
  `tasks.md`、`verification.md`、`archive.md` 和 spec 增量骨架。
- 初始 LetsGo CLI 脚手架：`init`、`update`、`enable`、`disable`、`doctor`。
- 单一来源的斜杠命令提示词和技能。
- 覆盖 CLI 安装、切换、doctor、状态门、位置参数解析和运行时守卫决策的
  Node 测试。

### 变更

- 把命令流程改名为 SDD 生命周期：`stitch-clarify`、`stitch-design`、
  `stitch-plan`、`stitch-apply`、`stitch-verify`、`stitch-archive`。
- 给每个 LetsGo 命令增加前后状态门。
- 把 clarify 状态产物对齐到 OpenSpec `proposal.md`，而不是 LetsGo 专有的
  `clarify.md`。

### 已知问题

- 运行时守卫决策依赖 OpenCode 权限元数据，采集真实命令轨迹后需要进一步细化。
