---
name: letsgo-apply
description: 编排 LetsGo apply 阶段的实现 writer 和 reviewer
user-invocable: false
---

# LetsGo Apply

这是 `apply` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
letsgo validate --before apply --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取已批准的 proposal、design、specs、tasks 和 `status.json`。
2. 必须读取并遵循 `lg:letsgo-tdd`；不得自行选择或随机改变实现流程。
3. 派发 `@lg:letsgo-apply-writer`，按任务顺序执行固定流程：
   `RED -> GREEN -> REFACTOR`。每个行为任务都必须把命令和结果记录到
   `tdd-evidence.md`，完成一个完整 Cycle 后才能勾选对应任务。
4. 只有纯文档、注释、模板、仅测试或其他不改变生产行为的修改可以豁免 TDD；writer 必须在
   `tdd-evidence.md` 中写明具体理由、验证命令和通过结果。
5. 派发 `@lg:letsgo-reviewer` 只读审查代码、测试、任务完成度和回归风险：
   是否符合 proposal、design、specs 和 tasks，是否有行为回归、测试质量、
   边界条件、安全问题或未完成任务；同时逐项核对任务与 TDD Cycle，确认 RED
   因预期原因失败、GREEN 由最小实现转绿、REFACTOR 后仍保持通过。
6. 缺少 TDD 证据、证据与任务不对应、RED 未真实失败或豁免不成立时，reviewer
   必须阻塞；让 writer 修复后重新审查。
7. reviewer 通过且任务全部完成后，将结果交回主 Agent。
8. 主 Agent 执行 `letsgo validate --after apply`，通过后执行 `letsgo advance apply`。

## 边界

- writer 只能修改任务允许的生产文件、测试文件、任务进度和 `tdd-evidence.md`。
- reviewer 不能修改文件，也不能推进状态。
- Skill 不允许手动修改 `status.json`。
