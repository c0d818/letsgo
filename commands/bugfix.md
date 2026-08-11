---
description: 修复缺陷
argument-hint: <修复需求描述>
---

# LetsGo 缺陷修复

使用方式：`/lg:bugfix <修复需求描述>`

`$ARGUMENTS` 是针对当前项目的修复需求初步描述，例如“修复登录页刷新后被退出的
问题”。change-id 由代理自己生成，用户不需要提供。

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

校验或审查失败时先将问题记录到 `openspec/.letsgo/issues.md`，然后停止并
报告；不进入下一阶段，不手动修改 `status.json`。若阻塞要求修改更早阶段，等待用户
明确授权 `/lg:reopen`；不得自动回退或另建变更绕过。

## 前置

1. 如果 `$ARGUMENTS` 为空，先请用户描述缺陷现象和期望行为。
2. 从修复需求中提炼 change-id：
   - 英文小写字母 + 连字符（kebab-case），简短表意，例如“修复登录页刷新后被
     退出的问题” -> `fix-login-refresh-logout`
   - 如果该 change-id 已存在，加后缀（如 `-2`）或换一个更精确的名字，并向
     用户说明
3. 把生成的 change-id 明确告诉用户，然后执行：

   ```bash
   letsgo new <change-id> --type bugfix
   letsgo select <change-id>
   ```

4. 之后所有命令都使用这个 change-id。

然后读取 `lg:letsgo-bugfix` 场景 Skill，确认类型特定要求。缺陷修复必须明确：
复现步骤、根因、最小修复和回归测试。

## 阶段明细

### 1. clarify（需求澄清）

- Skill：`lg:letsgo-clarify`（主 Agent 完成，不派发 subagent）
- 重点：确认复现步骤、影响范围、期望行为和回归验收标准
- 本阶段不修改生产代码、测试代码或设计文档。

### 2. design（技术设计）

- Skill：`lg:letsgo-design`
- 派发 subagent：`@lg:letsgo-design-writer` -> `@lg:letsgo-reviewer`
- 重点：根因分析、最小修复方案、回归测试策略

### 3. plan（任务规划）

- Skill：`lg:letsgo-plan`
- 派发 subagent：`@lg:letsgo-plan-writer` -> `@lg:letsgo-reviewer`
- 产物：`tasks.md`（复选框任务）

### 4. apply（实现变更）

- Skill：`lg:letsgo-apply`
- 派发 subagent：`@lg:letsgo-apply-writer` -> `@lg:letsgo-reviewer`
- 必须读取 `lg:letsgo-tdd`，按每个缺陷行为固定执行 RED -> GREEN -> REFACTOR，
  并记录 `tdd-evidence.md`；先用失败测试复现，再实现最小修复

### 5. verify（验证审查）

- Skill：`lg:letsgo-verify`
- 派发 subagent：`@lg:letsgo-verify-writer` -> `@lg:letsgo-reviewer`
- 重点：真实复现/回归证据，确认修复未引入行为回归
- `verification.md` 必须写明“未验证验收项：0”；存在待手动或浏览器验证项时停止

### 6. archive（归档沉淀）

- Skill：`lg:letsgo-archive`
- 派发 subagent：`@lg:letsgo-archive-writer` -> `@lg:letsgo-reviewer`
- 产物：长期规格更新、`archive.md`

## Subagent 编排规则

- 每个阶段 Skill 负责派发 subagent，顺序固定：
  `<阶段>-writer -> letsgo-reviewer -> 主 Agent 校验并推进`
- reviewer 不通过时，把问题交回当前 writer 修复，最多再派发一次 reviewer；仍阻塞则停止
- reviewer 不能修改文件，也不能推进状态
- 只启动 `lg:letsgo-*` 命名空间 Agent；Agent prompt 必须包含当前阶段完整
  `LETGO_RESULT` JSON 示例，禁止旧的 `LETGO_RESULT:` 协议
- Skill Hook 只表示已加载；writer/reviewer 前必须验证阶段产物与前置条件
- 相同 Guard/Write 错误出现后立即停止，不重复操作或用其他工具绕过

## 语言规则

- 规划文档（proposal/design/tasks/verification/archive）使用简体中文
- 代码注释、测试、用户文案沿用项目现有语言

## 完成

archive 推进后 `status.json` 变为 `done`。除非用户明确说不提交，默认只暂存本变更
的显式路径并执行本地 `git commit`；无法安全区分既有改动时停止。不要创建新的维护
变更，不自动 push。最后只输出一次不超过 12 行的简洁汇总；最终统计来自
`git show --stat`。
