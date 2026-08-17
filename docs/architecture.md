# 架构

LetsGo 有四层：

1. CLI：创建变更并强制生命周期状态机。
2. Claude Code 斜杠命令：把工作流暴露为 LetsGo 斜杠命令。
3. Claude Code 技能和代理：为以后的代理定义持久的过程规则。
4. Claude Code 钩子：注入状态上下文并拦截写权限。

插件根目录的 `.mcp.json` 还声明两个只读上下文来源：Context7 查询当前官方文档，
CodeGraph 查询本地代码图谱。CodeGraph 由独立的 `codegraph serve --mcp` 进程提供，
索引保存在目标项目的 `.codegraph/`，不进入 LetsGo 的运行状态或版本库。

第一个版本不分支 OpenSpec 或 Superpowers，而是通过安装项目本地文件来组合它们。

## 运行时结构

运行时强制拆分为薄钩子适配器和可测试的规则模块：

```text
hooks/
└── hooks.json
scripts/
├── guard.js
├── context.js
├── metrics.js
├── token-report.js
└── runtime-state.js
lib/
├── guard.js
├── run-summary.js
└── runtime-state.js
```

`scripts/guard.js` 把 `PreToolUse` 输入适配到 `lib/guard.js` 的决策模块，并
输出 `permissionDecision`。`scripts/context.js` 把 `SessionStart` 和
`UserPromptSubmit` 输入适配到 `buildSystemRules`，并输出 `additionalContext`。
`lib/guard.js` 是共享决策模块（钩子脚本与 CLI 共用）：活跃变更解析、系统规则
文本和写允许/拒绝检查。

`scripts/runtime-state.js` 监听 Skill 和 Subagent 生命周期，`lib/runtime-state.js`
维护唯一的 `openspec/.letsgo/runtime-state.json`。它在 writer 启动前检查阶段
Skill，在 reviewer 启动前检查 writer，并在 `advance` 前检查 reviewer 通过。Agent
启动还会检查当前阶段的完整规范名和 prompt 内的机器协议；默认 advisory 模式把问题记录
为警告并继续，新式 `Agent` 与旧式 `Task` 使用同一规则，所有专用 Agent 均无二次派发
工具。Reviewer 不设固定复审次数，但每轮必须先针对 blocking 产生实际修订。状态只覆盖
当前 session、变更和阶段。`lib/run-summary.js` 另外维护一个覆盖更新的
`run-summary.json`，按阶段保存精简结果，并由权限、压缩和守卫 Hook 累加轻量指标；
澄清问题和真实权限提示分别统计，并记录 CodeGraph 的实际放行次数；
不会为每个阶段或每次调用创建文件。

Skill 的 `PostToolUse` 只记录 `loaded`，不会把读取 Skill 当成完成阶段。完成结论来自
产物校验、writer/reviewer 最后一行的英文 `LETGO_RESULT` 和状态推进。变更完成后
active 标记被清除；正常中断后 `letsgo continue` 保留有效 runtime 并交给新 session，
损坏状态才由 `letsgo recover` 依据 `status.json` 重建。
`recover` 只返回权威阶段及 `/lg:continue` 交接命令，不直接决定或派发阶段 Agent；这样
即使模型对恢复结果作出错误的自然语言摘要，后续 Agent 门禁仍以 `status.json` 为准。
如果 runtime 事件 tracking 丢失而持久化阶段产物已通过 `validate --after`，`continue`
可以由 CLI 恢复 Writer 检查点；普通 Agent 永远不能直接编辑状态文件，且恢复后必须重新
加载 Skill、运行 reviewer。
reviewer 或验收发现早期实现遗漏时，`letsgo reopen` 把同一变更退回已完成的更早阶段，
并在 `status.json.reopens` 与 `run-summary.json.reopens` 中保留旧审查和失效阶段快照。

## 三层编排

工作流按三层组织，职责单一：

```text
commands/*.md   ->   skills/*/SKILL.md   ->   agents/*.md
```

1. **命令层**（`commands/start.md` 等）：用户触发的入口。包含完整生命周期
   流程——按顺序列出每个阶段要读取的 Skill、开始/完成校验和 `advance` 门，
   以及 subagent 编排规则。
2. **技能层**（`skills/letsgo-design/SKILL.md` 等）：告诉 agent 具体怎么做。
   阶段 Skill 负责派发专用 subagent（`<阶段>-writer` -> `lg:letsgo-reviewer`），
   reviewer 不通过时交回 writer 修复并仅复审一次；clarify 由主 Agent 完成需求交互。
3. **代理层**（5 个阶段 writer + 1 个通用 `lg:letsgo-reviewer`）：执行具体
   工作（写文档、写代码、跑验证、归档）和只读审查，遵守只读或只写边界。

`/lg:letsgo` 是命令层的特殊入口：把同一套生命周期封装成连续执行的一键流程。

## Skill 和 Subagent 编写模板

所有 `skills/*/SKILL.md` 和 `agents/*.md` 都使用相同的正文骨架，章节顺序固定：

```md
# LetsGo <名称>

## 职责
## 输入
## 执行流程
## 输出
## 边界
```

Skill frontmatter 固定使用 `name`、`description` 和 `user-invocable`；description
同时说明触发场景和职责。Subagent frontmatter 固定使用 `name`、`description`、
`tools` 和 `color`；writer 具有写入工具，reviewer 只保留只读工具。

场景 Skill、阶段 Skill 和支撑 Skill 可以在五个固定章节内表达不同规则，但不再
自行发明一级章节。Subagent 统一使用“Subagent”，状态文件统一写作
`status.json`。自动测试会检查 frontmatter、标题和章节顺序，防止新增文件逐渐
偏离模板。

## 插件优先结构

仓库根目录就是 Claude Code 插件根目录：

```text
.
├── .claude-plugin/
├── .mcp.json
├── commands/
├── skills/
├── agents/
├── hooks/
├── cli/
├── state/
├── templates/
├── tests/
└── docs/
```

仓库根目录还保留包元数据、兼容用 `letsgo` 启动器、文档和测试；插件标准入口位于
`bin/letsgo`，启用插件时由 Claude Code 自动加入 Bash PATH，npm bin 也指向该入口。

## CodeGraph 使用边界

- 只在目标项目已有 `.codegraph/` 索引时优先使用 `codegraph_explore`。
- 返回的源码、调用路径和影响摘要作为一次查询结果使用，不再机械重复 Grep/Read。
- MCP 或索引不可用时显式降级到内置工具，CodeGraph 不成为生命周期硬依赖。
- `letsgo doctor` 用 `codegraph version` 检查 CLI，并检查
  `.codegraph/codegraph.db` 是否存在；它不启动后台服务，也不写入检查日志。
- clarify 默认一次聚焦图谱查询；关键调用边缺失时建议补一次并记录原因。超出建议预算
  会产生 advisory warning，但不阻断生命周期。

这些限制的实测依据、权衡和调整条件见
[design-decisions.md](design-decisions.md)。
