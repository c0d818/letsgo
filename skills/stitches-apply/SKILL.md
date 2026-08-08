---
name: stitches-apply
description: 编排 Stitches apply 阶段的实现 writer 和 reviewer
user-invocable: false
---

# Stitches Apply

这是 `apply` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
stitches validate --before apply --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取已批准的 proposal、design、specs、tasks 和 `status.json`。
2. 派发 `@stitches-apply-writer`，按任务顺序执行测试优先的实现。
3. 派发 `@stitches-reviewer` 只读审查代码、测试、任务完成度和回归风险：
   是否符合 proposal、design、specs 和 tasks，是否有行为回归、测试质量、
   边界条件、安全问题或未完成任务。
4. reviewer 有阻塞问题时，让 writer 修复后重新审查。
5. reviewer 通过且任务全部完成后，将结果交回主 Agent。
6. 主 Agent 执行 `stitches validate --after apply`，通过后执行 `stitches advance apply`。

## 边界

- writer 只能修改任务允许的生产文件、测试文件和任务进度。
- reviewer 不能修改文件，也不能推进状态。
- Skill 不允许手动修改 `status.json`。
