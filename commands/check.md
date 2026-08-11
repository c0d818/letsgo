---
description: 查看变更状态
argument-hint: <change-id>
---

# 查看 LetsGo 状态

这是一个只读命令，不修改任何文件。

使用方式：

```text
/lg:check <change-id>
```

执行：

```bash
letsgo status --change <change-id>
```

向用户显示：

- 变更名称和需求类型
- 当前阶段及中文名称
- 已完成阶段
- 下一阶段
- 是否存在未完成任务或验证阻塞
- `run-summary.json` 中已实际加载的 Skill、Subagent 顺序、权限提示、Guard 拒绝和
  上下文压缩计数

不要根据对话记忆猜测状态，必须读取 `status.json`。如果找不到变更，明确
报告变更不存在。
