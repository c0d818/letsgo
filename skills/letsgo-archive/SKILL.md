---
name: letsgo-archive
description: 编排 LetsGo archive 阶段的归档 writer 和 reviewer
user-invocable: false
---

# LetsGo Archive

这是 `archive` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
letsgo validate --before archive --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取全部变更文档、长期规格、验证证据和 `status.json`。
2. 派发 `@lg:letsgo-archive-writer` 更新长期规格并填写 `archive.md`。
3. 派发 `@lg:letsgo-reviewer` 只读审查归档内容和证据可追溯性：`archive.md`
   是否完整、长期规格是否准确反映已验证行为、验证证据是否可追溯、后续工作
   是否明确。
4. reviewer 有问题时，让 writer 修复后重新审查。
5. reviewer 通过后，将结果交回主 Agent。
6. 主 Agent 执行 `letsgo validate --after archive`，通过后执行 `letsgo advance archive`。

## 边界

- writer 不能修改生产代码、测试代码或验证结论。
- reviewer 不能修改文件，也不能推进状态。
- Skill 不允许手动修改 `status.json`。
