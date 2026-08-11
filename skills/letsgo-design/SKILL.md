---
name: letsgo-design
description: 在 LetsGo design 阶段编排设计 writer 和只读 reviewer
user-invocable: false
---

# LetsGo Design

## 职责

作为 `design` 阶段唯一的 Subagent 编排入口，生成并审查技术设计和变更规格。

## 输入

- `openspec/changes/<change-id>/status.json`
- 已批准的 `proposal.md`
- 当前项目代码和相关规格

## 执行流程

1. 运行 `letsgo validate --before design --change <change-id>`；失败时停止并报告。
2. 派发 `@lg:letsgo-design-writer` 编写 `design.md`，必要时更新变更目录下的
   `specs/**`。
3. 向 `@lg:letsgo-reviewer` 传递最小审查包，只审查 design 相关产物、目标文件和
   diff，检查架构、数据流、影响范围、替代方案、风险和测试策略。
4. reviewer 有阻塞问题时，将问题交回 writer 修复并重新审查。
5. reviewer 通过后，交回主 Agent 运行
   `letsgo validate --after design --change <change-id>` 和
   `letsgo advance design --change <change-id>`。

## 输出

- `design.md`
- 必要的变更规格 `specs/**`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 不修改生产代码、测试代码或 `tasks.md`。
- reviewer 只读，不修改文件或推进状态。
- 不手动修改 `status.json`。
