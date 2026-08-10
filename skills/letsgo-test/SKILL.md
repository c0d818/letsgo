---
name: letsgo-test
description: 在 LetsGo 补充测试时，编排 test 类型的完整生命周期
user-invocable: false
---

# LetsGo Test

## 职责

编排测试补充场景。固定使用 `test` 变更类型和
`openspec/change-types/test/` 模板。

## 输入

- 测试覆盖缺口和验证目标
- 当前项目代码、规格和测试系统
- 当前变更的 `change-id`

## 执行流程

1. 使用 `letsgo new <change-id> --type test` 创建并选中变更。
2. 按 `clarify -> design -> plan -> apply -> verify -> archive` 顺序执行。
3. clarify 由主 Agent 按 `lg:letsgo-clarify` 完成。
4. 其余阶段分别读取对应阶段 Skill，并固定执行
   `<阶段>-writer -> letsgo-reviewer`。
5. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。

## 输出

输出测试设计、测试实现、覆盖验证证据和归档记录。

## 边界

- 不修改生产行为；仅测试变更按 `lg:letsgo-tdd` 记录豁免证据。
- 不跳过或重排生命周期阶段。
- 阶段通过后，仅由主 Agent 执行 `validate` 和 `advance`。
- 不手动修改 `status.json`。
