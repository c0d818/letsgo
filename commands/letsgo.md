---
description: 一键自动流程
argument-hint: <change-id> [类型]
---

# Stitches 一键自动流程

把变更自动推进到完成：clarify -> design -> plan -> apply -> verify -> archive ->
done。除校验失败或必须向用户确认需求外，不再逐阶段询问。

Required skill: `stitches-workflow`

## 使用方式

```text
/letsgo <change-id> [类型]
```

参数：

- `<change-id>`：变更 ID（`$ARGUMENTS` 的第一个参数）
- `[类型]`：可选，`feature | bugfix | refactor | test | maintenance`
  （`$ARGUMENTS` 的第二个参数），仅当变更不存在时需要

## 流程

1. 如果变更不存在：
   - 已提供类型 → 直接执行 `stitches new <change-id> --type <类型>`
   - 未提供类型 → 向用户问一次需求类型，再创建
2. 执行 `stitches select <change-id>`，设为当前变更。
3. 按顺序循环推进每个阶段，不得跳过：

   ```text
   clarify -> design -> plan -> apply -> verify -> archive
   ```

   每个阶段：

   ```bash
   stitches validate --before <state> --change <change-id>
   ```

   完成阶段工作（读取对应阶段 Skill，按
   `<阶段>-writer -> stitches-reviewer -> 主 Agent 校验推进` 编排），然后：

   ```bash
   stitches validate --after <state> --change <change-id>
   stitches advance <state> --change <change-id>
   ```

   阶段 Skill 映射：clarify -> `stitches-clarify`，design -> `stitches-design`，
   plan -> `stitches-plan`，apply -> `stitches-apply`，verify ->
   `stitches-verify`，archive -> `stitches-archive`。

4. 校验或审查失败 → 立即停止并报告，不进入下一阶段，不手动修改 `status.json`。
5. 全部完成 → 向用户汇总变更内容和验证证据。

## 规则

- clarify 阶段只在需求信息不足时向用户提最少的问题；确认后不再逐阶段询问。
- clarify 由主 Agent 完成需求交互；其余阶段由对应 Skill 调度 writer 和
  reviewer。
- 规划文档统一使用简体中文；代码、测试和用户文案沿用项目现有语言。
