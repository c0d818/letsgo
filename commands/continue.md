---
description: 从退出、重启、压缩或模型切换后的断点继续 LetsGo
argument-hint: [change-id]
---

# LetsGo 继续运行

使用方式：

```text
/lg:continue [change-id]
```

1. 运行 `letsgo continue [change-id]`。未提供 change-id 时自动选择 marker 指向的
   活跃变更或唯一活跃变更；存在多个且无法唯一确定时，主 Agent 必须调用
   `AskUserQuestion` 让用户选择，不得猜测。
   派发前必须核对返回 JSON 的 `projectDir`、`selected.changeId` 和 `selected.state`；
   它们与用户指定项目、变更不一致时立即停止，不得依据口头总结继续。
2. 读取返回的 `resume.action` 并严格执行：
   - `advance`：保留已通过 reviewer，执行返回的 advance 命令；确认
     `advanced: true` 后运行 `letsgo status`，再继续 `/lg:letsgo <change-id>`。
   - `load-skill`：加载列出的当前阶段 Skill，再继续 `/lg:letsgo <change-id>`。
   - `run-writer`：只启动返回的 writer，不重复已完成 Skill。
   - `run-reviewer`：只启动 reviewer，不重复已完成 writer。
   - `blocked`：展示 `blocking`，保持阻塞；不得重置次数或手动批准。只有用户明确
     授权时才执行返回的 `/lg:reopen`。
3. `continue` 只允许新 session 接管同一 change-id、同一阶段的现有 runtime；它不
   把无效、跨阶段或其他变更的证据恢复成 pass。
4. 如果没有活跃变更，报告没有可继续任务；状态损坏或幽灵 runtime 才使用
   `/lg:recover`，正常重启优先使用 `/lg:continue`。
5. 若 Guard 报告 `continue runtime` 与 `active/status.json` 冲突，禁止点击批准或改派
   其他阶段 Agent；展示冲突中的项目根目录与两组 change/stage，再按提示显式执行
   `/lg:continue <active-change-id>`。若这不是用户要继续的变更，先让用户选择。

不得删除 `runtime-state.json`、重复 reviewer、跳过 writer 或修改 `status.json`。
