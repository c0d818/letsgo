---
name: letsgo-verify
description: 在 LetsGo verify 阶段编排验证 writer 和只读 reviewer
user-invocable: false
---

# LetsGo Verify

## 职责

作为 `verify` 阶段唯一的 Subagent 编排入口，执行真实验证并审查证据是否支持
通过结论。

## 输入

- `proposal.md`、`design.md`、`specs/**` 和 `tasks.md`
- 当前代码差异、`tdd-evidence.md` 和 `status.json`
- 项目已有的测试、构建、lint 和规格检查命令

## 执行流程

1. 运行 `letsgo validate --before verify --change <change-id>`；失败时停止并报告。
2. 派发 `@lg:letsgo-verify-writer` 执行真实测试、构建、lint 和规格检查，并填写
   `verification.md`。
3. 派发 `@lg:letsgo-reviewer` 核对命令、结果、验收标准覆盖、未测试区域和剩余
   风险；证据不足时不得通过。
4. reviewer 有阻塞问题时，将问题交回 writer 补充验证并重新审查。
5. reviewer 通过后，交回主 Agent 运行
   `letsgo validate --after verify --change <change-id>` 和
   `letsgo advance verify --change <change-id>`。

## 输出

- 包含真实命令、结果、覆盖范围和剩余风险的 `verification.md`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 不修改生产代码、测试代码或任务内容。
- reviewer 只读，不修改文件或推进状态。
- 没有充分证据时不得写 `Status: Pass`。
