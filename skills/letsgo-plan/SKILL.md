---
name: letsgo-plan
description: 在 LetsGo plan 阶段编排任务 writer 和只读 reviewer
user-invocable: false
---

# LetsGo Plan

## 职责

作为 `plan` 阶段唯一的 Subagent 编排入口，将技术设计转为可执行任务并完成审查。

## 输入

- `proposal.md`、`design.md` 和变更目录下的 `specs/**`
- `status.json`
- 项目的测试和验证约束

## 执行流程

1. 运行 `letsgo validate --before plan --change <change-id>`；失败时停止并报告。
2. 派发 `@lg:letsgo-plan-writer` 将设计拆分为 `tasks.md`。
3. 派发 `@lg:letsgo-reviewer` 审查设计覆盖、任务顺序、目标文件、测试策略和
   完成条件。
4. reviewer 有阻塞问题时，将问题交回 writer 修复并重新审查。
5. reviewer 通过后，交回主 Agent 运行
   `letsgo validate --after plan --change <change-id>` 和
   `letsgo advance plan --change <change-id>`。

## 输出

- 具有顺序、目标文件、测试方式和完成条件的 `tasks.md`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 不修改生产代码或测试代码。
- reviewer 只读，不修改文件或推进状态。
- 不手动修改 `status.json`。
