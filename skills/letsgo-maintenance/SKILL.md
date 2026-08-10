---
name: letsgo-maintenance
description: 在 LetsGo 处理工程维护时，编排 maintenance 类型的完整生命周期
user-invocable: false
---

# LetsGo Maintenance

## 职责

编排文档、配置、依赖、CI、构建和发布维护。固定使用 `maintenance` 变更类型和
`openspec/change-types/maintenance/` 模板。

## 输入

- 工程维护目标和约束
- 当前项目配置、工具链、规格和验证方式
- 当前变更的 `change-id`

## 执行流程

1. 使用 `letsgo new <change-id> --type maintenance` 创建并选中变更。
2. 按 `clarify -> design -> plan -> apply -> verify -> archive` 顺序执行。
3. clarify 由主 Agent 按 `lg:letsgo-clarify` 完成。
4. 其余阶段分别读取对应阶段 Skill，并固定执行
   `<阶段>-writer -> letsgo-reviewer`。
5. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。

## 输出

输出维护方案、实施结果、验证证据和归档记录。

## 边界

- 明确维护是否改变生产行为；不改变时按 `lg:letsgo-tdd` 记录豁免证据。
- 不跳过或重排生命周期阶段。
- 阶段通过后，仅由主 Agent 执行 `validate` 和 `advance`。
- 不手动修改 `status.json`。
