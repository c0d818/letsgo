---
name: letsgo-workflow
description: 在通过 LetsGo Claude Code 插件或 LetsGo 斜杠命令工作的项目中使用
user-invocable: false
---

# LetsGo 工作流

LetsGo 把代理工作组织成一个小型 SDD 生命周期：clarify、design、plan、
apply、verify、archive。

## Skill 编排

命令只声明阶段需要的 Skill，不直接派发 Subagent。阶段 Skill 负责具体编排：

| 阶段 | Skill | Subagent 顺序 |
| --- | --- | --- |
| clarify | `lg:letsgo-clarify` | 主 Agent 完成需求交互和分析 |
| design | `lg:letsgo-design` | `lg:letsgo-design-writer` -> `lg:letsgo-reviewer` |
| plan | `lg:letsgo-plan` | `lg:letsgo-plan-writer` -> `lg:letsgo-reviewer` |
| apply | `lg:letsgo-apply` | `lg:letsgo-apply-writer` -> `lg:letsgo-reviewer` |
| verify | `lg:letsgo-verify` | `lg:letsgo-verify-writer` -> `lg:letsgo-reviewer` |
| archive | `lg:letsgo-archive` | `lg:letsgo-archive-writer` -> `lg:letsgo-reviewer` |

Reviewer 不通过时，阶段 Skill 负责把问题交回 writer 修复并重新审查；通过后
才把结果交回主 Agent 执行状态校验和推进。

## 核心规则

不要从模糊的需求直接跳到大规模修改。先确定变更类型，再按顺序走完生命周期
阶段。

| 变更类型 | 必经路径 |
| --- | --- |
| 小型本地修复 | clarify、design、plan、apply、verify、archive |
| 行为变更 | clarify、design、plan、apply、verify、archive |
| 跨组件变更 | clarify、design、plan、apply、verify、archive |

## 常见错误

- 在检查项目上下文之前就开始编辑。
- 跳过生命周期阶段或未经校验就推进。
- 实现开始后把已批准的 proposal 当成可选项。
- 在记录验证证据之前宣称完成。
