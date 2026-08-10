---
name: letsgo-tdd
description: 在 LetsGo 实现行为变更或修复缺陷时，强制执行 RED、GREEN、REFACTOR 和证据记录
user-invocable: false
---

# LetsGo TDD

## 职责

为每个行为任务强制执行测试优先流程，并生成可由状态机和 reviewer 核验的真实
证据。

## 输入

- `tasks.md` 中尚未完成的行为任务
- 已批准的 proposal、design 和 specs
- 当前代码、测试和 `tdd-evidence.md`

## 执行流程

1. **RED**：先添加或修改证明目标行为的最小测试；运行聚焦测试，确认它因预期
   缺失行为失败，而不是语法、环境或测试自身错误。
2. **GREEN**：只编写让当前失败测试通过的最小实现；运行同一聚焦测试并确认
   通过。
3. **REFACTOR**：在测试保护下整理实现；无需重构时记录“无”。再次运行聚焦
   测试并确认仍通过，风险允许时再运行更广测试。
4. 把每一步的真实命令、结果和必要摘要写入独立的
   `## Cycle N：<行为或任务>`，再勾选对应任务。
5. 对 `tasks.md` 中的每个行为任务重复上述 Cycle；不得合并、跳过或重排。

## 输出

写入 `openspec/changes/<change-id>/tdd-evidence.md`：

- TDD 模式：`模式：TDD`，每个 Cycle 按 `RED -> GREEN -> REFACTOR` 记录；RED
  结果为失败，GREEN 和 REFACTOR 结果为通过。
- 豁免模式：`模式：豁免`，在 `## 豁免` 中记录具体理由、实际验证命令和通过
  结果。

## 边界

- 不把先写实现后补测描述成 RED，不编造未执行的命令或结果。
- 仅纯文档、注释、模板、仅测试或其他不改变生产行为的修改可以豁免。
- 涉及生产行为、缺陷修复、接口或数据流变化时不得豁免。
- 一个完整 Cycle 结束前不勾选对应任务。
