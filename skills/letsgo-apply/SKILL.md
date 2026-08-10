---
name: letsgo-apply
description: 在 LetsGo apply 阶段编排实现 writer 和只读 reviewer，并强制 TDD 证据门禁
user-invocable: false
---

# LetsGo Apply

## 职责

作为 `apply` 阶段唯一的 Subagent 编排入口，按任务实现变更并强制执行 TDD
证据门禁。

## 输入

- 已批准的 `proposal.md`、`design.md`、`specs/**` 和 `tasks.md`
- `status.json`
- `lg:letsgo-tdd` 的固定流程和证据格式

## 执行流程

1. 运行 `letsgo validate --before apply --change <change-id>`；失败时停止并报告。
2. 读取并遵循 `lg:letsgo-tdd`，不得自行选择、跳过或重排实现流程。
3. 派发 `@lg:letsgo-apply-writer`，对每个行为任务固定执行
   `RED -> GREEN -> REFACTOR`，完成一个 Cycle 后再勾选对应任务。
4. 仅纯文档、注释、模板、仅测试或其他不改变生产行为的修改可以豁免；在
   `tdd-evidence.md` 中记录具体理由、验证命令和通过结果。
5. 派发 `@lg:letsgo-reviewer`，逐项对照任务、代码差异和 TDD Cycle，审查规格
   符合性、行为回归、测试质量、边界条件与安全风险。
6. 缺少证据、任务与 Cycle 不对应、RED 未真实失败或豁免不成立时必须阻塞，
   将问题交回 writer 修复并重新审查。
7. reviewer 通过且任务全部完成后，交回主 Agent 运行
   `letsgo validate --after apply --change <change-id>` 和
   `letsgo advance apply --change <change-id>`。

## 输出

- 符合任务计划的生产代码和测试代码
- 已完成的 `tasks.md`
- 可追溯的 `tdd-evidence.md`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 仅修改任务允许的生产文件、测试文件、任务进度和 TDD 证据。
- reviewer 只读，不修改文件或推进状态。
- 不手动修改 `status.json`、设计或验证结论。
