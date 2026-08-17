---
name: letsgo-archive
description: 在 LetsGo archive 阶段编排归档 writer 和只读 reviewer
user-invocable: false
---

# LetsGo Archive

## 职责

作为 `archive` 阶段唯一的 Subagent 编排入口，将已验证行为沉淀为长期规格和
归档记录。

## 输入

- 全部变更文档和 `status.json`
- 当前长期规格 `openspec/specs/**`
- 已通过审查的验证证据

## 执行流程

1. 运行 `letsgo validate --before archive --change <change-id>`；失败时停止并报告。
2. 派发 `@lg:letsgo-archive-writer` 更新长期规格并填写 `archive.md`；prompt 只传阶段、
   change-id、目标文件和归档重点，结果协议由 writer Agent 定义统一维护。
3. 向 `@lg:letsgo-reviewer` 传递最小审查包，审查归档完整性、长期规格准确性、证据可追溯性和
   后续工作。不要在 prompt 中复制或覆盖 reviewer Agent 定义的结果协议。
4. reviewer 有阻塞问题时，将问题交回 writer 修复后重新审查；不设固定次数，但每轮必须有实际修订。
5. reviewer 通过后，交回主 Agent 运行
   `letsgo validate --after archive --change <change-id>` 和
   `letsgo advance archive --change <change-id>`。

## 输出

- 更新后的 `openspec/specs/**`
- 完整的 `archive.md`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 不修改生产代码、测试代码或验证结论。
- reviewer 只读，不修改文件或推进状态。
- 不手动修改 `status.json`。
