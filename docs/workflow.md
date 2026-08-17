# 工作流

LetsGo 使用六阶段 SDD 生命周期：

1. Clarify：澄清请求和验收标准。
2. Design：设计技术方案和测试策略。
3. Plan：规划小的实现任务。
4. Apply：固定执行 RED -> GREEN -> REFACTOR，并记录可审查的 TDD 证据。
5. Verify：用真实命令输出和规格符合性审查验证。
6. Archive：把已验证的变更归档为持久的规格和历史。

对于已初始化 CodeGraph 的较大项目，Clarify 在代码影响分析时先调用
`codegraph_explore`，一次获取相关源码、调用路径、影响范围和测试线索。若
`.codegraph/` 不存在或 MCP 不可用，则记录原因并使用 `Grep`、`Read`；因此图谱能
减少探索成本，但不会阻塞生命周期。

按工作类型选择命令：

```text
/lg:start <需求描述>
/lg:bugfix <修复需求描述>
/lg:refactor <重构需求描述>
/lg:test <测试需求描述>
/lg:structure
```

四个类型入口都从用户描述中自动生成唯一的 kebab-case change-id；用户不需要预先
命名变更。每个入口先运行 `letsgo doctor` 检查 LetsGo/OpenSpec 和 CodeGraph，再确认
需求契约与工作流，最后通过 `letsgo new` 创建 OpenSpec 变更并输出位置、工作流、当前
状态和下一步。

每个场景命令执行内部生命周期：

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

每个命令都会指示代理在开始前运行 `letsgo validate --before <state>`，在完成
前运行 `letsgo validate --after <state>`。

`/lg:letsgo <change-id> [类型]` 一键自动把变更走完整个生命周期（工程维护类变更
可用 `letsgo new --type maintenance` 配合 `/lg:letsgo` 处理）；`/lg:check
<change-id>` 查看变更状态，`/lg:structure` 查看项目结构，`/lg:tokens` 查看主代理和
每个 subagent 的 token 用量（报告保存到 `openspec/.letsgo/token-report.md`），
均为只读命令；`/lg:log <问题>` 记录运行中遇到的问题。

## CLI 状态门

使用：

```bash
letsgo new <change-id> --type feature
letsgo select <change-id>
letsgo status --change <change-id>
letsgo validate --before <state> --change <change-id>
letsgo validate --after <state> --change <change-id>
letsgo advance <state> --change <change-id>
letsgo recover
letsgo continue [change-id]
letsgo reopen <state> --change <change-id> --reason "<人工解除理由>"
```

第一个实现通过 `status.json` 加必需文件强制生命周期。
`letsgo advance <state>` 只在 `<state>` 与 `status.json` 当前状态一致时推进。
`letsgo reopen <state>` 只允许经用户确认后回到已经完成的更早阶段。它撤销目标阶段
及其后续 completed/approved，保留旧 reviewer/runtime 证据并重置目标阶段运行门禁；
不能用于普通的同阶段复审，也不能省略人工解除理由。

`letsgo new` 从 OpenSpec 变更类型模板创建工作区：

```text
openspec/change-types/
├── feature/
├── bugfix/
├── refactor/
├── test/
└── maintenance/
```

每个类型目录提供完整的模板：`proposal.md`、`design.md`、`tasks.md`、
`verification.md`、`archive.md`，以及需要时的 spec 增量骨架。

生成的变更产物遵循 `CLAUDE.md` 中的语言规则：LetsGo 规划文档默认使用简体
中文，代码和项目文档沿用目标项目现有语言。

| 阶段 | 完成文件 | 关键完成检查 |
| --- | --- | --- |
| clarify | `proposal.md` | 存在为什么做、改变什么和验收标准 |
| design | `design.md` | 存在架构和测试策略 |
| plan | `tasks.md` | 存在复选框任务 |
| apply | `tasks.md`、`tdd-evidence.md` | 任务完成，且每个行为任务有完整 TDD Cycle 或有效豁免 |
| verify | `verification.md` | 包含“状态：通过” |
| archive | `archive.md` | 存在归档摘要 |

## 运行时守卫

插件通过 Claude Code 钩子提供运行时守卫：

1. `SessionStart` 和 `UserPromptSubmit` 把当前变更状态和生命周期规则注入模型
   上下文。
2. `PreToolUse` 检查写类工具（`Bash`、`Write`、`Edit`、`MultiEdit`、
   `NotebookEdit`）。默认 advisory 模式下，项目内跨阶段文件写入会放行并记录警告；
   项目外写入、高风险命令和无法确认目标的操作仍交给权限系统审查。

Node 命令默认采用 balanced 规则：`node -v`、`node --help`、`node --check` 和
`node --test` 自动放行；`apply`、`verify` 阶段还会放行 `node scripts/task.js`
这类项目内相对路径脚本。`node -e`、`node -p`、绝对路径、父目录路径以及包含
管道、重定向或命令串联的 Node 命令仍需用户批准。

守卫只在有 `openspec/` 目录的项目里启用；其他项目不受干扰。

### 轻量运行前检查

插件使用一个覆盖更新的 `openspec/.letsgo/runtime-state.json` 记录当前 session、
变更和阶段的编排状态，不为每次任务创建独立日志：

1. `PostToolUse Skill` 记录阶段 Skill 已加载；apply 同时要求 `letsgo-apply` 和
   `letsgo-tdd`。
2. `PreToolUse Agent|Task` 检查阶段 Skill、writer/reviewer 顺序、规范名和结果协议；
   默认 advisory 模式只警告不阻断，Reviewer 也不设固定次数。Agent 定义自身不包含
   `Agent`/`Task` 工具，仍由主 Agent 统一派发。
3. `SubagentStart` 和 `SubagentStop` 记录 Subagent 状态；writer 和 reviewer 最后
   一行使用 `LETGO_RESULT` 输出机器可读结论。
4. `letsgo advance <state>` 在更新 `status.json` 前检查阶段产物；runtime 中 Skill、
   writer、reviewer 缺口在 advisory 模式作为 `runtimeWarnings` 返回，不阻断推进。
   verify 仍要求 `未验证验收项：0`，阶段产物校验失败时不推进。
5. writer 重新启动后，旧 reviewer 结论立即过期，建议重新审查。
6. 同一 Writer/Reviewer 仍为 `started` 时重复启动会产生 advisory warning；Apply 仍
   建议等待 `partial` 结束后顺序续派，避免并发修改同一文件。
7. 后台 Agent 若未触发 `SubagentStop`，下一次派发前从其独立 transcript 补记最终
   `LETGO_RESULT`；没有合法最终结果时继续视为运行中，不得猜测完成。

该文件不保存提示词、代码内容、历史事件或 token 记录；阶段推进后自动重置为
下一阶段，archive 完成后重置为空状态并清除 active 标记。另有一个覆盖更新的
`run-summary.json` 保存阶段结果与真实权限提示、澄清问题、CodeGraph 查询、自动拒绝、
压缩和重复守卫拒绝计数。
`letsgo continue` 用于正常会话重启，保留同一 change/stage 的有效运行证据并返回下一
动作；多个活跃变更时要求明确选择。`letsgo recover` 用于清理幽灵或损坏状态，会重建
空 runtime，不能替代正常续跑。
`recover` 只修复中断或残留状态；后期验收发现实现遗漏时使用 `reopen`，两者不能互相
替代。reopen 后必须重新执行目标阶段的 Skill、writer、reviewer 和全部质量门。

生命周期完成后默认创建作用域明确的本地提交（用户明确拒绝时除外）；守卫允许
非 amend/fixup/squash 的本地 `git add` 和 `git commit`，`git push` 仍保留权限确认。
advisory warning 会记录但不阻断；真正的宿主权限拒绝仍不能用 Bash、临时脚本或递归
维护变更绕过。

守卫直接读取 `openspec/changes/*/status.json`。只有一个活跃变更时自动使用；
有多个变更时，`letsgo select <change-id>` 写入
`openspec/.letsgo/active.json`，守卫优先使用标记的变更。

各阶段推荐写入范围（advisory 模式不硬阻断项目内跨阶段写入）：

| 阶段 | 允许写入范围 |
| --- | --- |
| clarify | `openspec/changes/<change-id>/proposal.md`、`status.json` |
| design | `openspec/changes/<change-id>/design.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| plan | `openspec/changes/<change-id>/tasks.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| apply | 生产/测试文件、`tasks.md`、`tdd-evidence.md`、`status.json` |
| verify | `openspec/changes/<change-id>/verification.md`、`status.json` |
| archive | `archive.md`、`openspec/specs/`、`openspec/archive/<change-id>/`、`status.json` |
