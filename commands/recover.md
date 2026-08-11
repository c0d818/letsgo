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
5. 输出恢复后的 change-id 和阶段；不修改业务代码或生命周期产物。

不得手动编辑 `runtime-state.json`，不得删除有效变更目录。
