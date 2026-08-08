---
name: stitches-maintenance
description: 编排工程维护场景的 Stitches 流程和 Subagent
user-invocable: false
---

# 工程维护流程

变更类型固定为 maintenance。必须使用 openspec/change-types/maintenance/ 下的模板，适用于文档、配置、依赖、CI、构建和发布维护。

按 clarify -> design -> plan -> apply -> verify -> archive 执行。clarify 由主 Agent 完成，其余阶段读取对应阶段 Skill，并按 writer -> reviewer 调用：

- @stitches-design-writer -> @stitches-reviewer
- @stitches-plan-writer -> @stitches-reviewer
- @stitches-apply-writer -> @stitches-reviewer
- @stitches-verify-writer -> @stitches-reviewer
- @stitches-archive-writer -> @stitches-reviewer

reviewer 不通过时回到当前 writer 修复。通过后由主 Agent 执行 validate 和 advance。
