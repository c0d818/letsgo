---
name: letsgo-bugfix
description: 在 LetsGo 修复缺陷时，编排 bugfix 类型的完整生命周期
user-invocable: false
---

# LetsGo Bugfix

## 职责

编排缺陷修复场景。固定使用 `bugfix` 变更类型和
`openspec/change-types/bugfix/` 模板。

## 输入

- `/lg:bugfix <修复需求描述>` 中的项目修复需求
- 当前项目代码、规格和现有测试
- 主 Agent 从需求生成的唯一 kebab-case `change-id`

## 执行流程

1. 不要求用户提供 `change-id`；由主 Agent 从修复需求生成。
2. 使用 `letsgo new <change-id> --type bugfix` 创建并选中变更。
3. 按 `clarify -> design -> plan -> apply -> verify -> archive` 顺序执行。
4. clarify 由主 Agent 按 `lg:letsgo-clarify` 完成。
5. 其余阶段分别读取对应阶段 Skill，并固定执行
   `<阶段>-writer -> letsgo-reviewer`。
6. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。

## 输出

输出包含复现步骤、根因、最小修复、回归测试、验证证据和归档记录的 bugfix
变更。

## 边界

- 不跳过或重排生命周期阶段。
- apply 阶段必须先用失败测试复现缺陷，再实现最小修复。
- 阶段通过后，仅由主 Agent 执行 `validate` 和 `advance`。
- 不手动修改 `status.json`。
