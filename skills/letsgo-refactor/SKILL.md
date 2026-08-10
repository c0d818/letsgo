---
name: letsgo-refactor
description: 在 LetsGo 执行重构时，编排 refactor 类型的完整生命周期
user-invocable: false
---

# LetsGo Refactor

## 职责

编排重构场景。固定使用 `refactor` 变更类型和
`openspec/change-types/refactor/` 模板。

## 输入

- 重构目标和不得改变的外部行为
- 当前项目代码、规格和测试基线
- 当前变更的 `change-id`

## 执行流程

1. 使用 `letsgo new <change-id> --type refactor` 创建并选中变更。
2. 按 `clarify -> design -> plan -> apply -> verify -> archive` 顺序执行。
3. clarify 由主 Agent 按 `lg:letsgo-clarify` 完成。
4. 其余阶段分别读取对应阶段 Skill，并固定执行
   `<阶段>-writer -> letsgo-reviewer`。
5. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。

## 输出

输出具有行为基线、重构实现、回归证据和归档记录的 refactor 变更。

## 边界

- 不改变已批准的外部行为。
- 不跳过或重排生命周期阶段。
- 阶段通过后，仅由主 Agent 执行 `validate` 和 `advance`。
- 不手动修改 `status.json`。
