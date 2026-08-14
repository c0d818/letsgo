# 更新日志

LetsGo 的所有重要变更都记录在这里。

格式遵循 Keep a Changelog 风格的分节，版本在 1.0 之前遵循语义化版本。

## [未发布]

### 文档

- 新增统一的设计决策记录，集中说明生命周期门禁、CodeGraph 两次预算、reviewer
  两轮限制、TDD、零未验收项、权限策略和 Git 交付规则的依据、代价与调整条件。

## [0.4.24] - 2026-08-14

### 修复

- `Agent` 与旧式 `Task` 两种 Subagent 派发入口统一执行阶段名称白名单，不能再通过
  更换派发工具绕过完整规范名校验。
- 新增全仓一致性门禁：阶段 Skill 只能引用当前阶段 Writer 和统一 Reviewer 的完整名；
  所有 Agent 定义都不得拥有 `Agent`/`Task` 工具，阻止未受主编排器控制的嵌套派发。

## [0.4.23] - 2026-08-14

### 修复

- 分离 Agent 派发身份与生命周期记录身份：PreToolUse 只接受与 `agents/*.md` 对应的
  完整名称，`lg:review` 等宿主短名不能作为派发名冒充 reviewer。
- SubagentStart/Stop 和 Agent 结果回传仍可把已知宿主短名归一化到规范 Agent，既确保
  正确加载专属 `.md`，又避免 CodeAgent3 事件改名造成审查结果丢失。

## [0.4.22] - 2026-08-14

### 修复

- 活跃 LetsGo 阶段的 Agent PreToolUse 改为阶段白名单：clarify 仅允许 reviewer，其他
  阶段仅允许对应 Writer 与 reviewer；拒绝 `general-purpose`、缺失名称、随意命名和
  其他阶段 Agent。
- 保留 `lg:review -> lg:letsgo-reviewer` 精确兼容映射；非严格调用路径仍允许普通 Agent，
  不影响未由 LetsGo 编排的常规任务。

## [0.4.21] - 2026-08-14

### 改进

- `start`、`bugfix`、`refactor`、`test` 四个类型入口新增明确启动协议：先运行 doctor
  检查 LetsGo/OpenSpec 与 CodeGraph，再补齐输入、确认类型契约和工作流，最后用
  `letsgo new/select/status` 创建并核对 OpenSpec 变更。
- 四个入口统一输出变更位置、生命周期、当前状态和下一步；Refactor/Test 改为接收需求
  描述并自动生成 change-id，与 Feature/Bugfix 一致。
- 各入口只维护类型特有约束，六阶段实现继续集中在 Workflow 和阶段 Skill，减少重复
  规则的同时保留 Feature、Bugfix、Refactor、Test 的语义边界。

## [0.4.20] - 2026-08-14

### 修复

- Apply 改为按 `tasks.md` 未完成任务逐项派发和持久化 TDD 检查点；Writer 超时、截断、
  返回 `partial` 或缺少合法结果时，从最后一个完整 Cycle 续派，不进入 reviewer。
- Apply Writer 只有未完成任务为 0 且 `validate --after apply` 通过后才能返回 `ready`；
  runtime 会独立复验任务与 TDD 证据，把虚假的 `ready` 降级为 `incomplete`。
- `/lg:continue` 对不完整 Apply Writer 返回 `run-writer` 及具体校验错误，支持退出或模型
  超时后继续剩余任务，而不是把 validate 失败当成生命周期终点。

## [0.4.19] - 2026-08-14

### 修复

- CodeAgent3 将 reviewer 生命周期事件记录为 `lg:review` 时，runtime 统一归一化为
  `lg:letsgo-reviewer`，修复审查实际通过但 advance 仍报告“reviewer 尚未通过”的问题。
- reviewer 别名只影响身份记录，不放宽结果协议、Skill 前置条件、两轮上限或 Node
  写入权限；混合完整名与短名的启动/结束事件仍计为同一次审查。

## [0.4.18] - 2026-08-14

### 修复

- Guard 的 Bash 路径解析保留单引号和双引号内的完整参数，修复项目目录或文件路径
  含空格时被拆成多个片段、错误提示“未看到文件路径”的问题。
- Bash 路径提取兼容 Windows 反斜杠绝对路径与相对路径，并使用 Windows 路径语义
  解析目标；真正未提供目标路径的写命令仍要求人工确认，不扩大自动写入权限。

## [0.4.17] - 2026-08-13

### 修复

- Guard 使用 Windows 路径语义规范化盘符大小写、`\\`/`/` 和尾部分隔符，修复
  clarify 阶段未识别 `D:\\...\\openspec\\changes\\<id>\\proposal.md` 的问题。
- clarify 仍只允许变更根目录的 `proposal.md` 和状态文件，不放宽为整个目录或
  `specs/**`；未来阶段产物继续拒绝。
- 拒绝信息新增当前阶段允许的精确主产物路径，便于区分路径兼容问题和真实越阶段写入。

## [0.4.16] - 2026-08-13

### 新增

- 新增 `/lg:continue [change-id]` 和 `letsgo continue [change-id]`，用于退出、重启、
  上下文压缩或模型切换后从断点安全续跑。
- continue 自动选择 marker 指向或唯一活跃变更；多个活跃变更返回选择列表，并按
  持久化证据给出 `advance`、`load-skill`、`run-writer`、`run-reviewer` 或 `blocked`。

### 安全

- 新 session 只有显式执行 continue 后才能接管同一 change/stage 的 runtime；普通跨
  session 复用仍拒绝。reviewer pass 会保留，两轮 blocked 不重置，跨阶段证据不恢复。
- `recover` 保持为损坏/幽灵状态清理命令，不再作为正常重启续跑入口。

## [0.4.15] - 2026-08-13

### 修复

- 明确 reviewer 的 `LETGO_RESULT` 只能作为最终对话响应返回，由 Hook 写入 runtime；
  reviewer 不得 Write/Edit 文件，避免 clarify 阶段因错误写入未来产物而被 Guard 拦截。
- 新增 CodeAgent3 `PostToolUse(Agent).toolResponse` 结果回传通道；即使没有
  `SubagentStop.lastAssistantMessage`，也能把只读 reviewer 结果记录为 passed/blocked。
- 每次 `letsgo advance` 后必须确认 `advanced: true` 并用 `letsgo status` 核对下一状态；
  推进失败时禁止加载后续 Skill 或创建 `verification.md` 等未来阶段产物。
- Guard 拦截未来阶段产物时明确指出所属阶段和状态核对方法，不再诱导 Bash 绕过。

## [0.4.14] - 2026-08-13

### 修复

- Guard 识别 CodeAgent3 的 `ExternalDirectory`、`directoryPath` 和 `directory_path`，
  允许当前活跃变更目录的授权访问；其他变更目录仍拒绝，实际文件写入继续按阶段
  白名单检查。
- LetsGo CLI 判定兼容 `node ".../letsgo"` 和 Windows `".../letsgo.cmd"` 包装形式，
  修复 `letsgo advance` 内部访问当前变更目录时被当成普通写入的问题。
- CLI 包装命令仍拒绝 shell 控制符，不扩大到任意 Node 或复合命令。

## [0.4.13] - 2026-08-13

### 修复

- runtime-state Hook 同时识别 Claude Code snake_case 与 CodeAgent3 camelCase 事件字段，
  包括 `hookEventName`、`toolName`、`toolInput`、`skillName` 和 `sessionId`，修复 Skill
  已加载但 `runtime-state.json.skills` 仍为空的问题。
- Agent 的 start/stop、project directory、context、metrics 和 Guard 审计字段一并兼容，
  避免后续 writer/reviewer 状态或运行指标再次静默丢失。

## [0.4.12] - 2026-08-13

### 修复

- reviewer 初审和复审均为 `blocked` 时，禁止建议“手动批准当前产物”；必须展示
  第二轮 `blocking` 并保持阶段未通过。
- `letsgo reopen` 支持在两轮有效审查阻塞后，经用户明确授权重开当前阶段审查周期；
  原 reviewer 结果进入审计历史，runtime 清空后重新执行 Skill 和审查门禁。
- clarify 作为首阶段不再错误建议“退回更早阶段”，应重开当前 clarify 周期。

## [0.4.11] - 2026-08-13

### 修复

- Guard 新增 CodeAgent3 Write/Edit 参数兼容，除 `file_path`、`notebook_path` 外同时
  识别 `filePath`、`notebookPath`，不再把 clarify 阶段合法的 `proposal.md` 写入
  误判为“未看到文件路径”。
- 参数兼容只参与路径提取，原有阶段白名单不变；跨阶段文件仍会被拒绝。

## [0.4.10] - 2026-08-13

### 改进

- 统一用户提问交互：存在有限选项时由主 Agent 调用 `AskUserQuestion` 显示可直接
  选择的界面；路径、密钥、需求描述等自由文本才使用普通输入。
- 所有 Subagent 禁止直接询问用户，遇到需要用户决定的阻塞时，将问题和候选选项
  结构化交回主 Agent；新增模板一致性测试防止规则漂移。

## [0.4.9] - 2026-08-13

### 修复

- 所有 Hook 命令统一使用
  `${CLAUDE_PLUGIN_ROOT:-${CODEAGENT3_PLUGIN_ROOT}}` 并引用完整脚本路径，兼容 Claude
  Code 与 CodeAgent3；同时修复 Windows 安装目录含空格时命令被截断、
  `SessionStart` 无法加载 `scripts/context.js` 的问题。
- 新增 Hook 路径引用回归测试，覆盖 SessionStart、Guard、运行状态、指标和 token
  报告等全部入口。

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
