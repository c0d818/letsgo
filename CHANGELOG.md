# 更新日志

LetsGo 的所有重要变更都记录在这里。

格式遵循 Keep a Changelog 风格的分节，版本在 1.0 之前遵循语义化版本。

## [未发布]

### 文档

- 新增统一的设计决策记录，集中说明生命周期门禁、CodeGraph 两次预算、reviewer
  两轮限制、TDD、零未验收项、权限策略和 Git 交付规则的依据、代价与调整条件。

## [0.4.8] - 2026-08-13

### 修复

- Agent 的完整 `LETGO_RESULT` 协议改为只在 Agent 定义中维护；派发 prompt 可使用
  阶段、change-id、目标文件和任务重点组成的最小审查包，不再因未重复整段 JSON 被拦截。
- prompt 若主动覆盖协议，PreToolUse 仍拒绝缺字段、错误阶段/角色及
  `LETGO_RESULT:` 旧格式，保留运行前防错能力。
- Bash Guard 精确放行只读命令的 `/dev/null` 重定向，例如
  `grep ... 2>/dev/null`；重定向到普通文件仍按写入处理。

## [0.4.7] - 2026-08-12

### 修复

- done 后的安全本地交付链新增只读验收步骤：允许
  `git add && git diff --cached --stat` 和 `git commit && git show --stat`，覆盖 Claude
  Code 实际的暂存检查与提交汇总流程。
- 只读步骤采用精确白名单且限制顺序；push、额外命令和历史改写仍不放行。

## [0.4.6] - 2026-08-12

### 修复

- LetsGo CLI 判定改为只匹配命令行开头的 `letsgo` 可执行程序，不再把
  `openspec/.letsgo/` 文件路径误认成 CLI 命令。
- `done` 后的问题日志例外只适用于 Write/Edit 类工具，删除或其他 Bash 操作不再
  因目标路径是 `issues.md` 而被放行。

## [0.4.5] - 2026-08-12

### 修复

- 修复 archive 推进到 `done` 并清除 active 标记后，本地 Git 收尾仍可能被 Guard
  误判为“未选择活跃变更”的问题。
- 仅在存在六阶段均完成并批准的 `done` 变更时开放本地交付；支持单条
  `git add`/`git commit`、安全的 `git add && git commit` 链和 Claude Code 标准
  quoted-heredoc 多行提交信息。
- `done` 后仍允许写入 `openspec/.letsgo/issues.md`；普通业务写入、`git push`、
  额外 shell 链以及 amend/fixup/squash 历史改写继续被拦截。

## [0.4.4] - 2026-08-11

### 新增

- 新增 `letsgo reopen <state> --change <id> --reason <理由>` 和 `/lg:reopen`：经用户
  明确确认后，将被 reviewer/验收阻塞的同一变更退回已完成的更早阶段。
- reopen 自动撤销目标阶段及其后的完成/批准状态，并把旧 reviewer/runtime 和失效阶段
  快照保存在 `status.json.reopens` 与 `run-summary.json.reopens`，随后重新执行完整门禁。

### 修复

- verify 发现生产代码遗漏时不再建议另建 bugfix、手改状态或无审查推进；必须停止并等待
  用户授权 reopen，避免原变更的实现与验收证据割裂。

## [0.4.3] - 2026-08-11

### 修复

- Guard 精确放行仅打印数字行号范围的 `sed -n` 只读命令，避免在 archive 等阶段
  把源码查看误判为写入；`sed -i`、`w` 写文件脚本和 shell 重定向仍需审查或阻止。

## [0.4.2] - 2026-08-11

### 修复

- 读取 0.4.0 生成的旧 `run-summary.json` 时立即补齐 0.4.1 新增指标的零值，
  无需等待下一次 Hook 写入。
- 清除 TDD 模板末尾多余空行，避免同步到项目后触发 `git diff --check`。

## [0.4.1] - 2026-08-11

### 修复

- CodeGraph 的“两次上限”改为 Hook 硬门禁：记录真实放行次数并拒绝第三次调用。
- Agent 启动前校验完整 `lg:` 命名空间和当前 `LETGO_RESULT` 协议，拒绝旧协议；
  reviewer 每个产物最多初审一次、修订后复审一次。
- verify 必须逐条完成验收并写明“未验证验收项：0”；待手动或浏览器验证不能再
  以通过状态归档。
- 权限指标拆分为真实工具批准和澄清问题，CodeGraph 调用也纳入单文件运行摘要。
- 历史无命名空间 Subagent 在 token 报告中归一合并，避免重复统计。
- 生命周期完成后默认创建本地提交（用户明确拒绝时除外），不自动推送；最终汇总
  限制为一次简洁输出。

## [0.4.0] - 2026-08-11

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
- 新增 `letsgo recover` 与 `/lg:recover`，可在中断或上下文压缩后恢复唯一活跃
  变更，并自动清理幽灵 runtime 和失效的 active 标记。
- 新增覆盖更新的 `run-summary.json`：按阶段保留 Skill/Agent 结果，并统计权限提示、
  自动拒绝、压缩和重复守卫拒绝；不为每次任务创建独立 JSON。
- token 报告改为覆盖最新快照、合并同类 Subagent 调用，并显示阶段时间窗增量，
  避免累计快照导致总量虚高。

### 修复

- 为 `SessionStart`、`UserPromptSubmit` 和 `PreToolUse` Hook 输出补齐 Claude Code
  要求的 `hookEventName`，恢复生命周期上下文注入和运行时守卫决策。
- Skill Hook 只表示“已加载”，不再误判阶段已完成；writer/reviewer 必须提供结构化
  证据，clarify reviewer 还必须等 `proposal.md` 通过校验。
- clarify 第一问必须在同一回复直接给出完整问题和选项，恢复时从未回答问题继续。
- 相同守卫错误不再反复重试或通过 Bash/临时脚本绕过；变更完成后允许本地
  `git add`/`git commit`，`git push` 仍交给权限审查。
- 变更目录改为原子创建，既有不完整目录不会被覆盖；archive 完成后清除活跃标记。
- CodeGraph 默认只进行一次聚焦查询，缺少关键边时最多补一次并记录原因，禁止第三次。
- Subagent 统一使用精简中文摘要与英文 `LETGO_RESULT` 协议，限制复审轮次和上下文量。

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
