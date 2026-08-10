---
name: letsgo-design
description: 编排 LetsGo design 阶段的设计 writer 和 reviewer
user-invocable: false
---

# LetsGo Design

这是 `design` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
letsgo validate --before design --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取 `status.json`、`proposal.md`、现有代码和相关规格。
2. 派发 `@lg:letsgo-design-writer` 编写 `design.md`，必要时更新变更目录下的 `specs/**`。
3. writer 完成后，派发 `@lg:letsgo-reviewer` 只读审查 `design.md` 和
   `specs/**`：架构、数据流、影响范围、替代方案、风险、测试策略是否完整，
   是否存在需求遗漏、过度设计或不可实现的假设。
4. reviewer 有阻塞问题时，把问题交给 writer 修复，再重新派发 reviewer。
5. reviewer 通过后，将结果交回主 Agent。
6. 主 Agent 执行 `letsgo validate --after design`，通过后执行 `letsgo advance design`。

## 边界

- writer 不能修改生产代码、测试代码或 `tasks.md`。
- reviewer 不能修改文件，也不能推进状态。
- Skill 不允许手动修改 `status.json` 绕过状态机。
