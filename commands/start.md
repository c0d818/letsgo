---
description: 实现需求
argument-hint: <需求描述>
---

# LetsGo 新需求

使用方式：`/lg:start <需求描述>`

`$ARGUMENTS` 是需求的初步描述，例如“做一个下雨提醒功能”。change-id 由
代理自己生成，用户不需要提供。

## 总览

按顺序执行完整 SDD 生命周期，不得跳过或改变顺序：

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

每个阶段统一执行四步：

1. 开始校验：`letsgo validate --before <state> --change <change-id>`
2. 读取并执行该阶段 Skill（见“阶段明细”）
3. 完成校验：`letsgo validate --after <state> --change <change-id>`
4. 推进：`letsgo advance <state> --change <change-id>`

第 4 步必须检查结构化输出的 `advanced: true`，随后运行 `letsgo status` 并确认状态已
变为预期下一阶段；任一条件不成立都立即停止，不得加载下一阶段 Skill 或创建后续阶段
产物。

校验或审查失败时立即停止并报告，不进入下一阶段，不手动修改 `status.json`。若阻塞要求
修改更早阶段，等待用户明确授权 `/lg:reopen`；不得自动回退或另建变更绕过。

## 前置

1. 如果 `$ARGUMENTS` 为空，先请用户描述需求。
2. 从描述中提炼 change-id：
   - 英文小写字母 + 连字符（kebab-case），简短表意，例如“下雨提醒功能”
     -> `rain-reminder`
   - 如果该 change-id 已存在，加后缀（如 `-2`）或换一个更精确的名字，并向
     用户说明
3. 把生成的 change-id 明确告诉用户，然后执行：

   ```bash
   letsgo new <change-id> --type feature
   letsgo select <change-id>
   ```

4. 之后所有命令都使用这个 change-id。

然后读取 `lg:letsgo-feature` 场景 Skill，确认类型特定要求（模板与产物要求）。

## 阶段明细

### 1. clarify（需求澄清）

- Skill：`lg:letsgo-clarify`（主 Agent 完成，不派发 subagent）
- 流程：需求问答（一次一题带选项）-> 用户确认摘要 -> 代码影响分析 -> 外部知识
  -> 头脑风暴方案（至少 3 个候选）-> 用户确认方案 -> 起草并校验 `proposal.md`
  -> 反向审查（`@lg:letsgo-reviewer`）-> 修订定稿
- 本阶段不修改生产代码、测试代码或设计文档。

### 2. design（技术设计）

- Skill：`lg:letsgo-design`
- 派发 subagent：`@lg:letsgo-design-writer` -> `@lg:letsgo-reviewer`
- 产物：`design.md`，必要时更新 `specs/**`

### 3. plan（任务规划）

- Skill：`lg:letsgo-plan`
- 派发 subagent：`@lg:letsgo-plan-writer` -> `@lg:letsgo-reviewer`
- 产物：`tasks.md`（复选框任务）

### 4. apply（实现变更）

- Skill：`lg:letsgo-apply`
- 派发 subagent：`@lg:letsgo-apply-writer` -> `@lg:letsgo-reviewer`
- 必须读取 `lg:letsgo-tdd`，按每个行为任务固定执行 RED -> GREEN -> REFACTOR，
  并记录 `tdd-evidence.md`；缺少证据不得推进

### 5. verify（验证审查）

- Skill：`lg:letsgo-verify`
- 派发 subagent：`@lg:letsgo-verify-writer` -> `@lg:letsgo-reviewer`
- 产物：`verification.md`，必须包含真实证据、“状态：通过”和“未验证验收项：0”；
  仍有待手动/浏览器验证项时必须停在 verify

### 6. archive（归档沉淀）

- Skill：`lg:letsgo-archive`
- 派发 subagent：`@lg:letsgo-archive-writer` -> `@lg:letsgo-reviewer`
- 产物：长期规格更新、`archive.md`

## Subagent 编排规则

- 每个阶段 Skill 负责派发 subagent，顺序固定：
  `<阶段>-writer -> letsgo-reviewer -> 主 Agent 校验并推进`
- reviewer 不通过时，把问题交回当前 writer 修复，最多再派发一次 reviewer；仍阻塞则停止
- reviewer 不能修改文件，也不能推进状态
- 只启动 `lg:letsgo-*` 命名空间 Agent；派发 prompt 只提供阶段、change-id、目标文件
  和任务重点，结果协议以 Agent 定义为唯一来源，禁止复制或使用旧的 `LETGO_RESULT:` 协议
- Skill Hook 只表示已加载；writer/reviewer 前必须验证阶段产物与前置条件
- 相同 Guard/Write 错误出现后立即停止，不重复操作或用其他工具绕过

## 语言规则

- 规划文档（proposal/design/tasks/verification/archive）使用简体中文
- 代码注释、测试、用户文案沿用项目现有语言

## 完成

archive 推进后 `status.json` 变为 `done`。除非用户明确说不提交，默认只暂存本变更
的显式路径并执行本地 `git commit`；无法与既有用户改动安全区分时停止。不要创建
新的维护变更，不自动 push。最后只输出一次不超过 12 行的简洁汇总，不使用宽表格；
文件数和增删行必须来自最终 `git show --stat`。
