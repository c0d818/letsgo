# 架构

Stitches 有四层：

1. CLI：创建变更并强制生命周期状态机。
2. Claude Code 斜杠命令：把工作流暴露为 Stitches 斜杠命令。
3. Claude Code 技能和代理：为以后的代理定义持久的过程规则。
4. Claude Code 钩子：注入状态上下文并拦截写权限。

第一个版本不分支 OpenSpec 或 Superpowers，而是通过安装项目本地文件来组合它们。

## 运行时结构

运行时强制拆分为薄钩子适配器和可测试的规则模块：

```text
hooks/
└── hooks.json
scripts/
├── guard.js
└── context.js
lib/
└── guard.js
```

`scripts/guard.js` 把 `PreToolUse` 输入适配到 `lib/guard.js` 的决策模块，并
输出 `permissionDecision`。`scripts/context.js` 把 `SessionStart` 和
`UserPromptSubmit` 输入适配到 `buildSystemRules`，并输出 `additionalContext`。
`lib/guard.js` 是共享决策模块（钩子脚本与 CLI 共用）：活跃变更解析、系统规则
文本和写允许/拒绝检查。

## 三层编排

工作流按三层组织，职责单一：

```text
commands/*.md   ->   skills/*/SKILL.md   ->   agents/*.md
```

1. **命令层**（`commands/start.md` 等）：用户触发的入口。包含完整生命周期
   流程——按顺序列出每个阶段要读取的 Skill、开始/完成校验和 `advance` 门，
   以及 subagent 编排规则。
2. **技能层**（`skills/stitches-design/SKILL.md` 等）：告诉 agent 具体怎么做。
   阶段 Skill 负责派发专用 subagent（`<阶段>-writer` -> `stitches-reviewer`），
   reviewer 不通过时交回 writer 修复；clarify 由主 Agent 完成需求交互。
3. **代理层**（5 个阶段 writer + 1 个通用 `stitches-reviewer`）：执行具体
   工作（写文档、写代码、跑验证、归档）和只读审查，遵守只读或只写边界。

`/letsgo` 是命令层的特殊入口：把同一套生命周期封装成连续执行的一键流程。

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

仓库根目录还保留包元数据、`stitches` CLI 启动器、文档和测试。
