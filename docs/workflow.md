# 工作流

Stitches 使用六阶段 SDD 生命周期：

1. Clarify：澄清请求和验收标准。
2. Design：设计技术方案和测试策略。
3. Plan：规划小的实现任务。
4. Apply：以测试优先的纪律实现计划。
5. Verify：用真实命令输出和规格符合性审查验证。
6. Archive：把已验证的变更归档为持久的规格和历史。

按工作类型选择命令：

```text
/start <需求描述>
/bugfix <change-id>
/refactor <change-id>
/test <change-id>
/structure
```

每个场景命令执行内部生命周期：

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

每个命令都会指示代理在开始前运行 `stitches validate --before <state>`，在完成
前运行 `stitches validate --after <state>`。

`/letsgo <change-id> [类型]` 一键自动把变更走完整个生命周期（工程维护类变更
可用 `stitches new --type maintenance` 配合 `/letsgo` 处理）；`/check
<change-id>` 查看变更状态，`/structure` 查看项目结构，均为只读命令。

## CLI 状态门

使用：

```bash
stitches new <change-id> --type feature
stitches select <change-id>
stitches status --change <change-id>
stitches validate --before <state> --change <change-id>
stitches validate --after <state> --change <change-id>
stitches advance <state> --change <change-id>
```

第一个实现通过 `status.json` 加必需文件强制生命周期。
`stitches advance <state>` 只在 `<state>` 与 `status.json` 当前状态一致时推进。

`stitches new` 从 OpenSpec 变更类型模板创建工作区：

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

生成的变更产物遵循 `CLAUDE.md` 中的语言规则：Stitches 规划文档默认使用简体
中文，代码和项目文档沿用目标项目现有语言。

| 阶段 | 完成文件 | 关键完成检查 |
| --- | --- | --- |
| clarify | `proposal.md` | 存在为什么做、改变什么和验收标准 |
| design | `design.md` | 存在架构和测试策略 |
| plan | `tasks.md` | 存在复选框任务 |
| apply | `tasks.md` | 没有未勾选的任务 |
| verify | `verification.md` | 包含“状态：通过” |
| archive | `archive.md` | 存在归档摘要 |

## 运行时守卫

插件通过 Claude Code 钩子提供运行时守卫：

1. `SessionStart` 和 `UserPromptSubmit` 把当前变更状态和生命周期规则注入模型
   上下文。
2. `PreToolUse` 按当前变更的阶段写权限范围拦截写类工具（`Bash`、`Write`、
   `Edit`、`MultiEdit`、`NotebookEdit`）。范围外的写入被拒绝；看不到文件路径
   的写入交给用户审查。

守卫只在有 `openspec/` 目录的项目里启用；其他项目不受干扰。

守卫直接读取 `openspec/changes/*/status.json`。只有一个活跃变更时自动使用；
有多个变更时，`stitches select <change-id>` 写入
`openspec/.stitches/active.json`，守卫优先使用标记的变更。

各阶段写权限范围：

| 阶段 | 允许写入范围 |
| --- | --- |
| clarify | `openspec/changes/<change-id>/proposal.md`、`status.json` |
| design | `openspec/changes/<change-id>/design.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| plan | `openspec/changes/<change-id>/tasks.md`、`openspec/changes/<change-id>/specs/`、`status.json` |
| apply | 生产/测试文件、`tasks.md`、`status.json` |
| verify | `openspec/changes/<change-id>/verification.md`、`status.json` |
| archive | `archive.md`、`openspec/specs/`、`openspec/archive/<change-id>/`、`status.json` |
