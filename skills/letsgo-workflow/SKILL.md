---
name: letsgo-workflow
description: 在 LetsGo Claude Code 插件或斜杠命令运行时，统一编排 SDD 生命周期
user-invocable: false
---

# LetsGo Workflow

## 职责

统一编排 `clarify -> design -> plan -> apply -> verify -> archive` 生命周期，并
保持命令、Skill 和 Subagent 三层职责分离。

## 输入

- 用户请求、变更类型和 `change-id`
- 当前项目代码、规格和 `status.json`
- 对应场景 Skill 与阶段 Skill

## 执行流程

1. 先确定变更类型并读取对应场景 Skill。
2. 按固定顺序执行所有生命周期阶段，不跳过或重排。
3. 命令只声明阶段；阶段 Skill 负责具体编排：

   | 阶段 | Skill | Subagent 顺序 |
   | --- | --- | --- |
   | clarify | `lg:letsgo-clarify` | 主 Agent 完成需求交互和分析 |
   | design | `lg:letsgo-design` | `lg:letsgo-design-writer -> lg:letsgo-reviewer` |
   | plan | `lg:letsgo-plan` | `lg:letsgo-plan-writer -> lg:letsgo-reviewer` |
   | apply | `lg:letsgo-apply` | `lg:letsgo-apply-writer -> lg:letsgo-reviewer` |
   | verify | `lg:letsgo-verify` | `lg:letsgo-verify-writer -> lg:letsgo-reviewer` |
   | archive | `lg:letsgo-archive` | `lg:letsgo-archive-writer -> lg:letsgo-reviewer` |

4. 派发 reviewer 时只传最小审查包：阶段、change-id、目标文件、验收标准、相关
   diff 和风险重点；不让 reviewer 重新遍历整个项目。
5. reviewer 不通过时，将 `blocking` 交回当前 writer 修复后重新审查；当前默认宽松模式
   不设置固定复审次数。每轮必须针对最新 blocking 产生实际修订，不得空转重复审查，
   也不得伪造 pass。只有相同问题重复且没有进展、环境不可用或必须由用户决策时才停止。
   若阻塞证明需要修改更早阶段，等待用户明确授权 `/lg:reopen`；不得自动回退、另建
   变更或手动修改状态。reopen 后从目标阶段重新执行完整流程。
6. reviewer 通过后，由主 Agent 执行阶段完成校验和状态推进。
   必须检查 `letsgo advance` 返回 `advanced: true`，再运行 `letsgo status` 确认状态
   已进入预期下一阶段。命令执行过不等于推进成功；返回失败、无法解析或状态未变化时
   立即停止，不得加载下一阶段 Skill、启动其 Subagent 或创建任何后续阶段产物。
7. 优先使用上表当前阶段列出的完整 Agent 名，并保持先加载 Skill、再启动 writer、最后
   reviewer 的顺序。默认宽松模式下命名、顺序或协议问题只产生警告，不阻断当前流程；
   仍应在后续调用修正。派发 prompt 只提供阶段、change-id、目标文件
   和任务重点；完整 `LETGO_RESULT` 协议以 Agent 定义为唯一来源，不在 prompt 中复制。
8. Guard 的 advisory 警告不阻断流程；记录警告后继续使用正常文件工具。真正由宿主权限
   系统拒绝的高风险或项目外操作才停止，不使用 Bash/Node/临时脚本绕过。
9. 导致流程停止的校验、Guard、Agent、工具或环境问题必须追加到
   `openspec/.letsgo/issues.md`；瞬时超时若由 Apply 检查点自动恢复则不重复记录，
   同一问题再次出现或最终阻塞时再记录一次。
10. 生命周期 `done` 后默认执行本地 Git 交付，除非用户明确说“不提交”：先用
   `git status --short` 区分本变更和既有用户改动，只对本变更的生产/测试文件与
   `openspec/changes/<change-id>/` 使用显式路径 `git add -- ...`，再 `git commit`。
   无法安全区分时停止并报告；不创建新变更。提交汇总必须来自最终
   `git show --stat`，`git push` 仍需用户明确批准。
11. 检查文件优先使用 Read/Glob/Grep；Bash 一次只执行一个命令，不用 `;`、`&&`、
    管道或重定向拼接只读检查，减少权限提示。
12. 需要用户决定且存在有限选项时，主 Agent 必须调用 `AskUserQuestion`；只有路径、
    密钥或需求描述等自由文本才普通提问。Subagent 不直接询问用户，只把阻塞问题
    和候选选项结构化交回主 Agent。

## 输出

输出从已确认需求到实现、验证、长期规格和归档记录的完整可追溯变更。

## 边界

- 不从模糊需求直接开始大规模修改。
- 不跳过校验或手动推进 `status.json`。
- 不在记录真实验证证据前宣称完成。
- 已批准的 proposal 在实现阶段不是可选参考。
- runtime tracking 缺失时使用 `/lg:continue` 或依靠 advance 的 advisory warning，
  不把运行时记录缺失当作生命周期永久阻塞。
