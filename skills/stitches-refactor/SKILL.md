---
name: stitches-refactor
description: 编排重构场景的 Stitches 流程和 Subagent
user-invocable: false
---

# 重构流程

变更类型固定为 refactor。必须使用 openspec/change-types/refactor/ 下的模板，并证明外部行为保持不变。

按 clarify -> design -> plan -> apply -> verify -> archive 执行。clarify 由主 Agent 完成，其余阶段读取对应阶段 Skill，并按 writer -> reviewer 调用：

- @stitches-design-writer -> @stitches-reviewer
- @stitches-plan-writer -> @stitches-reviewer
- @stitches-apply-writer -> @stitches-reviewer
- @stitches-verify-writer -> @stitches-reviewer
- @stitches-archive-writer -> @stitches-reviewer

reviewer 不通过时回到当前 writer 修复。通过后由主 Agent 执行 validate 和 advance。
