---
name: stitches-spec
description: 通过 Stitches 创建、应用、审查或归档 OpenSpec 风格变更时使用
user-invocable: false
---

# Stitches 规格

OpenSpec 是持久状态层。Stitches 用它让意图、实现与验证保持一致。

## 目录约定

```text
openspec/
  change-types/
  specs/
  changes/
    <change-id>/
      status.json
      proposal.md
      tasks.md
      design.md
      verification.md
      archive.md
      specs/
```

当工作跨越模块边界时，必须提供 `design.md`。

先做规格符合性审查，再审查代码风格。
