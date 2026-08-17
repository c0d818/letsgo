---
description: 实现新需求
argument-hint: <需求描述>
---

# LetsGo 新需求

使用方式：`/lg:start <需求描述>`。本命令固定创建 `feature` 变更；修复错误或保持行为
不变的结构调整应分别使用 `/lg:bugfix`、`/lg:refactor`。

Required skills: `lg:letsgo-feature`、`lg:letsgo-workflow`

## 1. 环境与 CodeGraph 预检

1. 在项目根目录运行 `letsgo doctor` 并解析结构化结果；不得凭目录印象跳过。
2. `installed` 为 false 时，先报告缺失的 LetsGo/OpenSpec 组件并停止创建变更。
3. 根据 CodeGraph 状态处理：
   - `codegraphReady: true`：显示“CodeGraph：可用”，继续。
   - `codegraphExecutable: false`：提醒用户可运行
     `npm install -g @colbymchenry/codegraph`；用 `AskUserQuestion` 让用户选择“安装后继续
     （推荐）”或“本次降级到 Grep/Read”。不得自行全局安装。
   - CLI 已安装但 `codegraphIndexed: false`：提醒在项目根目录运行 `codegraph init`，
     并把 `.codegraph/` 加入 `.gitignore`；让用户选择初始化或本次降级。
4. 用户选择降级时记录原因，clarify 使用 Grep/Read，不得声称 CodeGraph 已调用。

## 2. 补齐并确认需求

1. `$ARGUMENTS` 为空时，先用普通自由文本问题询问“要新增什么能力、给谁使用、期望
   结果是什么？”，收到有效需求前不得生成 change-id 或创建目录。
2. 输入存在但缺少关键边界时，一次只问一个最影响方案的问题；有限选项使用
   `AskUserQuestion`。
3. 从需求生成唯一 kebab-case `change-id`，并检查同名变更是否已存在。
4. 向用户展示并确认：
   - 类型：`feature`
   - 需求摘要、范围内、范围外
   - 可验证的验收标准
   - change-id
   - 工作流：`clarify -> design -> plan -> apply -> verify -> archive -> done`
5. 用 `AskUserQuestion` 提供“确认并创建（推荐）”和“继续修改需求”；未确认不得创建。

## 3. 用 LetsGo OpenSpec 命令创建变更

用户确认后依次执行，禁止用 `mkdir`、Write 或临时脚本手工仿造目录：

```bash
letsgo new <change-id> --type feature
letsgo select <change-id>
letsgo status --change <change-id>
```

确认返回的 `changeDir` 是 `openspec/changes/<change-id>/`，类型是 `feature`，当前状态是
`clarify`；任何一项不一致都停止并报告。

## 4. 固定启动摘要与下一步

创建成功后先输出以下四项，再继续生命周期：

```text
变更位置：openspec/changes/<change-id>/
工作流：clarify -> design -> plan -> apply -> verify -> archive -> done
当前状态：clarify（需求澄清）
下一步：加载 lg:letsgo-feature、lg:letsgo-workflow 和 lg:letsgo-clarify，起草 proposal.md
```

随后按 `lg:letsgo-workflow` 执行完整生命周期，不在 Command 中复制阶段实现。Feature
必须证明新增行为满足验收标准；apply 遵循 TDD，verify 必须“未验证验收项：0”。

## 5. 审查、阻塞与完成

- 每阶段建议按 Skill -> writer（clarify 除外）-> reviewer -> validate -> advance；reviewer
  阻塞后交回修订并重新审查，不设固定次数，但不得无变化空转。
- 每次 advance 必须确认 `advanced: true` 并重新读取 status；失败时不得创建任何后续阶段产物。
- done 后除非用户明确说不提交，默认对本变更显式路径执行 `git add` 和本地 commit，
  不自动 push。
- 最终汇总不超过 12 行，包含变更、验证、提交和剩余风险。
