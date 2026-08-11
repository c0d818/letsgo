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
/lg:refactor <change-id>
/lg:test <change-id>
/lg:structure
```

`/lg:start` 和 `/lg:bugfix` 都从用户描述中自动生成唯一的 kebab-case
change-id；用户不需要预先命名变更。

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
```

第一个实现通过 `status.json` 加必需文件强制生命周期。
`letsgo advance <state>` 只在 `<state>` 与 `status.json` 当前状态一致时推进。

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
2. `PreToolUse` 按当前变更的阶段写权限范围拦截写类工具（`Bash`、`Write`、
   `Edit`、`MultiEdit`、`NotebookEdit`）。范围外的写入被拒绝；看不到文件路径
   的写入交给用户审查。

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
2. `PreToolUse Agent` 在启动 writer 前检查阶段 Skill，在启动 reviewer 前检查
   writer 已完成，同时拒绝非 `lg:` 名称、旧结果协议和第三次 reviewer。
3. `SubagentStart` 和 `SubagentStop` 记录 Subagent 状态；writer 和 reviewer 最后
   一行使用 `LETGO_RESULT` 输出机器可读结论。
4. `letsgo advance <state>` 在更新 `status.json` 前检查阶段 Skill、writer 和
   reviewer；verify 还要求 `未验证验收项：0`，缺少证据时不推进。
5. writer 重新启动后，旧 reviewer 结论立即过期，必须重新审查。

该文件不保存提示词、代码内容、历史事件或 token 记录；阶段推进后自动重置为
下一阶段，archive 完成后重置为空状态并清除 active 标记。另有一个覆盖更新的
`run-summary.json` 保存阶段结果与真实权限提示、澄清问题、CodeGraph 查询、自动拒绝、
压缩和重复守卫拒绝计数。
`letsgo recover` 可根据 `status.json` 恢复唯一活跃变更，多个活跃变更时要求明确选择。

生命周期完成后默认创建作用域明确的本地提交（用户明确拒绝时除外）；守卫允许
非 amend/fixup/squash 的本地 `git add` 和 `git commit`，`git push` 仍保留权限确认。
任何相同守卫拒绝都必须停止重试，不能
用 Bash、临时脚本或递归维护变更绕过。

守卫直接读取 `openspec/changes/*/status.json`。只有一个活跃变更时自动使用；
有多个变更时，`letsgo select <change-id>` 写入
`openspec/.letsgo/active.json`，守卫优先使用标记的变更。

各阶段写权限范围：

| 阶段 | 允许写入范围 |
| --- | --- |
| clarify | `openspec/changes/<change-id>/proposal.md`、`status.json` |
| design | `openspec/changes/<change-id>/design.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| plan | `openspec/changes/<change-id>/tasks.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| apply | 生产/测试文件、`tasks.md`、`tdd-evidence.md`、`status.json` |
| verify | `openspec/changes/<change-id>/verification.md`、`status.json` |
| archive | `archive.md`、`openspec/specs/`、`openspec/archive/<change-id>/`、`status.json` |
