---
name: letsgo-feature
description: 编排新需求场景的 LetsGo 流程和 Subagent
user-invocable: false
---

# 新需求流程

变更类型固定为 feature。读取 openspec/change-types/feature/ 下的模板。

按 clarify -> design -> plan -> apply -> verify -> archive 执行。

clarify 由主 Agent 完成需求问答、代码分析、方案确认和反向审查（DeepReview）。
design、plan、apply、verify、archive 分别读取对应阶段 Skill。
阶段 Skill 必须按 writer -> reviewer 调用专用 Subagent：

- @lg:letsgo-design-writer -> @lg:letsgo-reviewer
- @lg:letsgo-plan-writer -> @lg:letsgo-reviewer
- @lg:letsgo-apply-writer -> @lg:letsgo-reviewer
- @lg:letsgo-verify-writer -> @lg:letsgo-reviewer
- @lg:letsgo-archive-writer -> @lg:letsgo-reviewer

reviewer 不通过时回到当前 writer 修复。通过后由主 Agent 执行 validate 和 advance。
