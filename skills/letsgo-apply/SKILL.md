---
name: letsgo-apply
description: 在 LetsGo apply 阶段编排实现 writer 和只读 reviewer，并强制 TDD 证据门禁
user-invocable: false
---

# LetsGo Apply

## 职责

作为 `apply` 阶段唯一的 Subagent 编排入口，按任务实现变更并强制执行 TDD
证据门禁。

## 输入

- 已批准的 `proposal.md`、`design.md`、`specs/**` 和 `tasks.md`
- `status.json`
- `lg:letsgo-tdd` 的固定流程和证据格式

## 执行流程

1. 运行 `letsgo validate --before apply --change <change-id>`；失败时停止并报告。
2. 读取并遵循 `lg:letsgo-tdd`，不得自行选择、跳过或重排实现流程。
3. 读取 `tasks.md` 并建立未勾选任务队列。每次只把队首任务、已有检查点和目标文件
   派发给 `@lg:letsgo-apply-writer`；对行为任务固定执行 `RED -> GREEN -> REFACTOR`，
   完成一个 Cycle、写入证据后才能勾选对应任务。prompt 只传阶段、change-id、当前
   任务和目标文件，结果协议由 writer Agent 定义统一维护。
4. writer 返回后必须重新读取 `tasks.md` 和 `tdd-evidence.md`：
   - 返回 `partial`、Agent 超时、连接中断、输出截断、缺少有效结果或当前任务仍未勾选，
     都属于可恢复的未完成状态；从文件中的最后一个完整 Cycle 重新派发/续派 writer，
     不得因此进入 reviewer、validate-after 或询问用户是否跳过。
   - 当前任务完成但仍有其他未勾选任务时，继续派发下一个任务；不得把一次 Agent
     调用结束误当成 apply 阶段完成。
   - 只有扫描结果为“未完成任务：0”时，才允许结束 writer 循环。
   下一次 writer 必须等上一调用完成并记录结果后才能启动；不得为加速而并发派发两个
   `lg:letsgo-apply-writer`。上一调用的 `partial` 表示顺序续派检查点，不表示失败。
5. 仅纯文档、注释、模板、仅测试或其他不改变生产行为的修改可以豁免；在
   `tdd-evidence.md` 中记录具体理由、验证命令和通过结果。
6. 未完成任务为 0 后运行 `letsgo validate --after apply --change <change-id>`。若错误
   是未完成任务或 TDD 证据缺口，继续派发 writer 修复并重新校验；只有环境故障或
   必须由用户决策的真实阻塞才停止。校验通过前不得启动 reviewer。
7. 向 `@lg:letsgo-reviewer` 传递最小审查包，逐项对照任务、相关代码差异和 TDD Cycle，审查规格
   符合性、行为回归、测试质量、边界条件与安全风险。不要在 prompt 中复制或覆盖
   reviewer Agent 定义的结果协议。
8. 缺少证据、任务与 Cycle 不对应、RED 未真实失败或豁免不成立时必须阻塞，
   将问题交回 writer 修复并只重新审查一次；仍阻塞则停止。
9. reviewer 通过后，交回主 Agent 再次运行
   `letsgo validate --after apply --change <change-id>`，确认仍为“未完成任务：0”，再运行
   `letsgo advance apply --change <change-id>`。

## 输出

- 符合任务计划的生产代码和测试代码
- 已完成的 `tasks.md`
- 可追溯的 `tdd-evidence.md`
- reviewer 的通过结论或阻塞问题

## 边界

- writer 仅修改任务允许的生产文件、测试文件、任务进度和 TDD 证据。
- reviewer 只读，不修改文件或推进状态。
- 不手动修改 `status.json`、设计或验证结论。
- Runtime 把任务或 TDD 证据不完整的 `ready` 降级为 `incomplete`；此时必须续派
  writer。不得手动篡改 runtime、改用 Node/Bash 绕过或直接批准。
