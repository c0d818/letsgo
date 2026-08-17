# LetsGo 项目规则

本项目由 LetsGo 管理。

LetsGo 插件会提供 Context7 远程 MCP（`context7`）和 CodeGraph 本地 MCP
（`codegraph`），写操作由插件守卫按阶段管理。

较大项目先在本机安装 CodeGraph CLI，并在项目根目录运行一次 `codegraph init`。
该命令只创建本地 `.codegraph/` 索引；把目录加入 `.gitignore`，不要提交。项目
存在索引时，代码结构、调用路径和影响面分析优先使用 `codegraph_explore`；工具或
索引不可用时说明原因，再降级到 `Grep`、`Read` 等内置工具。

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
3. `/lg:refactor <重构需求描述>`
4. `/lg:test <测试需求描述>`

四个类型入口都会从描述中自动生成 change-id，先检查 CodeGraph、确认需求契约和
工作流，再通过 `letsgo new` 创建 OpenSpec 变更。所有场景命令内部按顺序执行
`clarify -> design -> plan -> apply -> verify -> archive`，
用户不需要单独调用阶段命令。`/lg:letsgo <change-id> [类型]` 一键自动走完整个
生命周期（工程维护类变更可用 `letsgo new --type maintenance` 配合
`/lg:letsgo` 处理）。`/lg:structure` 查看项目结构，`/lg:check <change-id>` 查看变更
状态，`/lg:log <问题>` 记录运行中遇到的问题。
随时可以用 `/lg:tokens` 查看本次会话主代理和每个 subagent 的 token 用量，
报告保存在 `openspec/.letsgo/token-report.md`。

使用 `letsgo validate` 和 `letsgo advance`，让
`openspec/changes/<change-id>/status.json` 与流程保持同步。
涉及行为变更时，不要跳过生命周期状态。

插件会在 `openspec/.letsgo/runtime-state.json` 中覆盖记录当前阶段已加载的 Skill
和 Subagent 状态，并在单一 `openspec/.letsgo/run-summary.json` 中保留最近一次运行的
阶段顺序、权限提示、Guard 警告和上下文压缩计数。建议先加载阶段 Skill，再启动
writer；writer 完成后再启动 reviewer。writer 或 reviewer 的最后一行应输出其
定义中要求的 `LETGO_RESULT` 英文机器协议。Agent 类型优先使用当前阶段表中列出的完整
`lg:letsgo-*` 规范名。默认宽松模式下，命名、顺序、协议和项目内跨阶段写入问题只记录
advisory warning，不阻断生命周期；设置 `LETSGO_ENFORCEMENT=strict` 可恢复硬门禁。
派发 prompt 只提供当前阶段、change-id、目标文件和任务重点；协议以 Agent 定义为
唯一来源，避免复制或使用 `LETGO_RESULT:` 旧协议。说明文字使用简体中文。缺少 runtime
证据时，宽松模式的 `letsgo advance` 会返回 `runtimeWarnings` 但仍可在阶段产物校验通过后
推进。reviewer 阻塞后按 `blocking` 修订并重新审查，不设固定次数，但不得无变化空转、
手动批准当前产物或伪造 reviewer pass。若需修改已完成的更早阶段，等待用户授权后使用
`/lg:reopen` 退回对应阶段。

apply 阶段必须读取 `letsgo-tdd`，对每个行为任务固定执行
`RED -> GREEN -> REFACTOR`，并把真实命令和结果记录到
`openspec/changes/<change-id>/tdd-evidence.md`。只有纯文档、注释、模板、仅测试或
其他不改变生产行为的修改可以记录理由后豁免；缺少有效证据不得推进 verify。
verify 只有在逐条完成验收且 `未验证验收项：0` 时通过；仍有待手动或浏览器验证项
时不得归档。

需要用户决定且存在有限选项时，主 Agent 必须调用 `AskUserQuestion` 显示可直接选择
的交互界面；只有路径、密钥、需求描述等无法合理枚举的自由文本才使用普通输入。
Subagent 不直接询问用户，只把阻塞问题和候选选项结构化交回主 Agent。

随时可以使用 `/lg:check <change-id>` 查看当前阶段、已完成阶段和下一步。

每次 `letsgo advance` 后必须检查结构化输出的 `advanced: true`，再运行 `letsgo status`
确认已进入预期下一阶段。仅仅执行过命令不代表推进成功；输出失败、无法解析或状态仍在
原阶段时立即停止，不得加载下一阶段 Skill、启动 Subagent 或创建后续阶段产物。

同一 Guard/Write 错误只允许出现一次：立即读取状态、记录问题并停止，不重复 Write，
不改用 Bash/Node/临时脚本绕过。正常退出、重启、压缩或模型切换后运行
`/lg:continue [change-id]` 从断点续跑；只有状态残留或损坏时才运行 `letsgo recover`
或 `/lg:recover`。
reviewer 或验收证明需要修改更早阶段时，停止并等待用户明确授权 `/lg:reopen`；该命令
必须记录人工解除理由并保留旧审查历史，不得自动回退、另建变更或手改状态。

生命周期到 `done` 后，默认运行验证并执行本地 `git add` 和 `git commit`；用户明确
要求不提交时才跳过。不要为提交再创建 maintenance 变更。提交前运行测试和
`git diff --check`，提交后必须用 `git show --stat` 生成真实汇总。`git push` 修改
远端，仍需用户明确批准。最终只输出一次不超过 12 行的简洁汇总。
