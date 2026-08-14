---
description: 修复 LetsGo 残留运行状态
argument-hint: ""
---

# LetsGo 恢复运行状态

使用方式：`/lg:recover`

1. 运行 `letsgo recover`。
2. 若只有一个活跃变更，恢复 `active.json` 和当前阶段的空 runtime。
3. 若没有活跃变更，清除幽灵 runtime 与失效 active marker。
4. 若存在多个活跃变更，停止并要求用户先运行 `letsgo select <change-id>`。
5. 只认命令 JSON 中 `resume.stageSource` 指向的 `status.json` 为阶段事实来源；不得用
   对话摘要、恢复前记忆或自然语言中的 “recovered-stage” 推断当前阶段。
6. 恢复成功后不得直接派发任何 writer/reviewer，也不得自行声称进入某个阶段；必须原样
   执行 JSON 中的 `resume.command`（`/lg:continue <change-id>`），由 continue 返回准确的
   Skill、Writer、Reviewer 或 advance 动作。
7. 输出恢复后的 change-id、阶段、阶段来源和下一条命令；不修改业务代码或生命周期产物。

不得手动编辑 `runtime-state.json`，不得删除有效变更目录。
