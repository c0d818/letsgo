---
name: letsgo-verify
description: 编排 LetsGo verify 阶段的验证 writer 和 reviewer
user-invocable: false
---

# LetsGo Verify

这是 `verify` 阶段的唯一 Subagent 编排入口。

## 开始前

先运行开始校验：

```bash
letsgo validate --before verify --change <change-id>
```

校验失败时停止并报告，不要开始本阶段工作。

## 流程

1. 读取 proposal、design、specs、tasks、代码差异和 `status.json`。
2. 派发 `@lg:letsgo-verify-writer` 执行真实测试、构建、lint 和规格检查，并填写 `verification.md`。
3. 派发 `@lg:letsgo-reviewer` 只读核对验证证据：命令是否真实执行、结果是否
   支持结论、测试是否覆盖验收标准、未测试区域和剩余风险是否诚实；证据不足
   时不得标记“状态：通过”。
4. 证据不足或结论不成立时，让 writer 补充验证后重新审查。
5. reviewer 通过后，将结果交回主 Agent。
6. 主 Agent 执行 `letsgo validate --after verify`，通过后执行 `letsgo advance verify`。

## 边界

- writer 不能修改生产代码、测试代码或任务内容。
- reviewer 不能修改文件，也不能推进状态。
- 没有真实证据时不得标记 `Status: Pass`。
