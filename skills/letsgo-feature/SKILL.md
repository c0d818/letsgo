---
name: letsgo-feature
description: 在 LetsGo 处理新功能需求时，编排 feature 类型的完整生命周期
user-invocable: false
---

# LetsGo Feature

## 职责

编排新功能场景。固定使用 `feature` 变更类型和
`openspec/change-types/feature/` 模板。

## 输入

- 用户提供的需求描述
- 当前项目代码、规格和约束
- 主 Agent 从需求生成的唯一 kebab-case `change-id`

## 执行流程

1. 使用 `letsgo new <change-id> --type feature` 创建并选中变更。
2. 按 `clarify -> design -> plan -> apply -> verify -> archive` 顺序执行。
3. clarify 由主 Agent 按 `lg:letsgo-clarify` 完成。
4. 其余阶段分别读取对应阶段 Skill，并固定执行
   `<阶段>-writer -> letsgo-reviewer`。
5. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。

## 输出

输出完整的 feature 变更文档、实现、测试、验证证据和归档记录。

## 边界

- 不跳过或重排生命周期阶段。
- 阶段通过后，仅由主 Agent 执行 `validate` 和 `advance`。
- 不手动修改 `status.json`。
