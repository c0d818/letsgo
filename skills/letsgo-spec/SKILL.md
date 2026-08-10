---
name: letsgo-spec
description: 在 LetsGo 创建、应用、审查或归档 OpenSpec 风格变更时，维护持久规格状态
user-invocable: false
---

# LetsGo Spec

## 职责

使用 OpenSpec 作为 LetsGo 的持久状态层，保持需求意图、实现、验证和长期规格
一致。

## 输入

- 当前变更的 `change-id`、类型和阶段
- `openspec/changes/<change-id>/` 下的阶段产物
- `openspec/specs/**` 下的长期规格

## 执行流程

1. 从 `status.json` 确认当前阶段，不根据对话记忆猜测。
2. 在对应阶段读写 `proposal.md`、`design.md`、`tasks.md`、`tdd-evidence.md`、
   `verification.md`、`archive.md` 或变更规格。
3. 工作跨越模块边界时提供 `design.md`。
4. 先做规格符合性审查，再做工程质量审查。
5. archive 阶段仅把已经验证的行为更新到长期规格。

## 输出

维护以下持久结构：

```text
openspec/
  change-types/
  specs/
  changes/
    <change-id>/
      status.json
      proposal.md
      design.md
      tasks.md
      tdd-evidence.md
      verification.md
      archive.md
      specs/
```

## 边界

- 不跳过生命周期校验。
- 不把未验证行为写入长期规格。
- 不手动修改 `status.json`。
