---
name: letsgo-plan
description: 编排 LetsGo plan 阶段的任务 writer 和 reviewer
user-invocable: false
---

# LetsGo Plan

这是 `plan` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
letsgo validate --before plan --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取 `proposal.md`、`design.md`、`specs/**` 和 `status.json`。
2. 派发 `@lg:letsgo-plan-writer` 将设计拆成 `tasks.md`。
3. 派发 `@lg:letsgo-reviewer` 只读审查 `tasks.md`：是否覆盖设计、任务顺序
   是否合理、文件目标是否明确、测试策略是否可执行、完成条件是否可验证，
   是否存在跳步或隐藏工作。
4. reviewer 有问题时，让 writer 修复后重新审查。
5. reviewer 通过后，将结果交回主 Agent。
6. 主 Agent 执行 `letsgo validate --after plan`，通过后执行 `letsgo advance plan`。

## 边界

- writer 不能修改生产代码或测试代码。
- reviewer 不能修改文件，也不能推进状态。
- Skill 不允许手动修改 `status.json`。
