---
description: 修复缺陷
argument-hint: <修复需求描述>
---

# LetsGo 缺陷修复

使用方式：`/lg:bugfix <修复需求描述>`。本命令固定创建 `bugfix` 变更，不能退化为普通
feature；实现必须先复现缺陷，再做最小修复和回归验证。
change-id 由代理自己生成，用户不需要预先命名。

Required skills: `lg:letsgo-bugfix`、`lg:letsgo-workflow`

## 1. 环境与 CodeGraph 预检

1. 在项目根目录运行 `letsgo doctor`，解析 `installed`、`openspec`、
   `codegraphExecutable`、`codegraphIndexed` 和 `codegraphReady`。
2. LetsGo/OpenSpec 未安装完整时，列出缺失项并停止；不得手工创建状态文件。
3. CodeGraph 分支必须明确：
   - `codegraphReady: true`：报告可用，clarify 优先用聚焦图谱查询定位调用链和影响面。
   - `codegraphExecutable: false`：提醒
     `npm install -g @colbymchenry/codegraph`，用 `AskUserQuestion` 让用户选择“安装后继续
     （推荐）”或“本次使用 Grep/Read 降级”；不得自行全局安装。
   - 已安装但 `codegraphIndexed: false`：提醒运行 `codegraph init` 并忽略
     `.codegraph/`；让用户选择初始化或降级。
4. 降级不阻塞 Bugfix，但必须记录原因，不得伪造 CodeGraph 证据。

## 2. 补齐缺陷信息并确认工作流

1. `$ARGUMENTS` 为空时，先询问实际现象、期望行为和最小复现步骤；没有有效缺陷描述
   前不得生成 change-id。
2. 输入不完整时按顺序一次一题补齐：
   - 实际行为与错误信息
   - 期望行为
   - 可重复步骤、输入数据和运行环境
   - 影响范围、严重程度及是否存在临时绕过
3. 从描述生成唯一的 `fix-...` kebab-case change-id，检查同名目录。
4. 向用户展示：类型 `bugfix`、问题摘要、复现条件、预期结果、初始影响范围、验收标准、
   change-id，以及工作流
   `clarify -> design -> plan -> apply -> verify -> archive -> done`。
5. 用 `AskUserQuestion` 提供“确认并创建（推荐）”和“继续补充缺陷”；用户确认后才创建。

## 3. 用 LetsGo OpenSpec 命令创建变更

严格依次执行：

```bash
letsgo new <change-id> --type bugfix
letsgo select <change-id>
letsgo status --change <change-id>
```

`letsgo new` 是 LetsGo 支持的 OpenSpec 创建命令；禁止改用 `mkdir` 或 Write 手工拼装
`openspec/changes/`。核对 `changeDir`、`type: bugfix` 和 `state: clarify`。

## 4. 固定启动摘要与下一步

创建成功后先输出：

```text
变更位置：openspec/changes/<change-id>/
工作流：clarify -> design -> plan -> apply -> verify -> archive -> done
当前状态：clarify（缺陷复现与根因澄清）
下一步：加载 lg:letsgo-bugfix、lg:letsgo-workflow 和 lg:letsgo-clarify，形成可复现的 proposal.md
```

随后进入统一 Workflow。Clarify 必须确认复现，Design 必须记录根因和最小修复，Apply
必须先写失败回归测试并执行 RED -> GREEN -> REFACTOR；不能把猜测当根因。

## 5. 审查、阻塞与完成

- 每阶段执行 Skill -> writer（clarify 除外）-> reviewer -> validate -> advance。
- reviewer 初审阻塞后把问题交回 writer，最多再派发一次；仍阻塞就报告，不得手动批准。
- advance 只有返回 `advanced: true` 且 status 是下一阶段才算成功；失败时不得创建任何
  后续阶段产物。
- verify 必须重新执行原复现路径、回归测试并写明“未验证验收项：0”。
- done 后除非用户明确说不提交，默认显式 `git add` 本变更路径并本地 commit；不自动 push。
- 最终汇总不超过 12 行，包含根因、修复、回归证据、提交和风险。
