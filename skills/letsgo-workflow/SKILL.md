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

4. reviewer 不通过时，将问题交回当前 writer 修复并重新审查。
5. reviewer 通过后，由主 Agent 执行阶段完成校验和状态推进。
6. 遵守运行前检查：先完成阶段 Skill，再启动 writer；writer 完成后再启动
   reviewer。Subagent 最后一行必须输出约定的 `LETGO_RESULT`。

## 输出

输出从已确认需求到实现、验证、长期规格和归档记录的完整可追溯变更。

## 边界

- 不从模糊需求直接开始大规模修改。
- 不跳过校验或手动推进 `status.json`。
- 不在记录真实验证证据前宣称完成。
- 已批准的 proposal 在实现阶段不是可选参考。
- 不绕过 `runtime-state.json` 的 Skill、writer 和 reviewer 顺序检查。
