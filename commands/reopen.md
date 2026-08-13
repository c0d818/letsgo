---
description: 经用户确认后把阻塞变更退回更早阶段或重开当前审查周期
argument-hint: <change-id> <目标阶段> <人工解除理由>
---

# LetsGo 重新打开阶段

只在 reviewer 或验收阻塞、且用户明确确认修复方向后使用。它不是自动重试命令，
也不能用来手动批准未通过的产物。

使用方式：

```text
/lg:reopen <change-id> <目标阶段> <人工解除理由>
```

执行：

```bash
letsgo reopen <目标阶段> --change <change-id> --reason "<人工解除理由>"
```

规则：

1. 先读取 `status.json`、`runtime-state.json` 和 reviewer 阻塞结论。目标通常是已完成
   的更早阶段；若当前阶段已完成两轮有效审查且最终 `blocked`，允许重开当前阶段。
2. 理由必须记录阻塞项和用户决定；缺少明确用户授权时停止，不得自行 reopen。
3. reopen 会撤销目标阶段及其后的 completed/approved，保留旧 reviewer 结果到
   `status.json.reopens` 和 `run-summary.json.reopens`，并创建干净的目标阶段 runtime。
4. 成功后从目标阶段正常执行 Skill → writer → reviewer；不得复用旧 pass，也不得
   跳过 TDD 或验收。
5. 两轮仍阻塞时不得提供“手动批准产物”选项。应列出第二轮 `blocking`，让用户选择
   补充信息后重开当前阶段，或修改更早阶段；clarify 是首阶段时只能重开 clarify。
6. reopen 失败时停止；不得手动编辑 `status.json`、伪造 reviewer pass 或另建变更绕过。

输出重新打开前后的阶段、人工理由、撤销的阶段以及下一步 `/lg:letsgo <change-id>`。
