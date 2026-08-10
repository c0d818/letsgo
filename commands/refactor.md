---
description: 代码重构
argument-hint: <change-id>
---

# LetsGo 重构

使用方式：`/lg:refactor <change-id>`

`<change-id>` 是 `$ARGUMENTS` 的第一个参数。

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
报告；不进入下一阶段，不手动修改 `status.json`。

## 前置

如果变更不存在，先执行：

```bash
letsgo new <change-id> --type refactor
letsgo select <change-id>
```

然后读取 `lg:letsgo-refactor` 场景 Skill，确认类型特定要求。重构必须保持行为
不变，并明确行为不变性的验证策略。

## 阶段明细

### 1. clarify（需求澄清）

- Skill：`lg:letsgo-clarify`（主 Agent 完成，不派发 subagent）
- 重点：重构目标、范围边界、行为不变性和兼容性要求
- 本阶段不修改生产代码、测试代码或设计文档。

### 2. design（技术设计）

- Skill：`lg:letsgo-design`
- 派发 subagent：`@lg:letsgo-design-writer` -> `@lg:letsgo-reviewer`
- 重点：目标结构、迁移路径、行为等价性验证方案

### 3. plan（任务规划）

- Skill：`lg:letsgo-plan`
- 派发 subagent：`@lg:letsgo-plan-writer` -> `@lg:letsgo-reviewer`
- 产物：`tasks.md`（复选框任务）

### 4. apply（实现变更）

- Skill：`lg:letsgo-apply`
- 派发 subagent：`@lg:letsgo-apply-writer` -> `@lg:letsgo-reviewer`
- 必须读取 `lg:letsgo-tdd`；涉及生产行为时执行 RED -> GREEN -> REFACTOR，
  不改变生产行为时记录豁免理由和验证证据

### 5. verify（验证审查）

- Skill：`lg:letsgo-verify`
- 派发 subagent：`@lg:letsgo-verify-writer` -> `@lg:letsgo-reviewer`
- 重点：全量测试通过、行为等价性证据、无接口破坏

### 6. archive（归档沉淀）

- Skill：`lg:letsgo-archive`
- 派发 subagent：`@lg:letsgo-archive-writer` -> `@lg:letsgo-reviewer`
- 产物：长期规格更新、`archive.md`

## Subagent 编排规则

- 每个阶段 Skill 负责派发 subagent，顺序固定：
  `<阶段>-writer -> letsgo-reviewer -> 主 Agent 校验并推进`
- reviewer 不通过时，把问题交回当前 writer 修复，再重新派发 reviewer
- reviewer 不能修改文件，也不能推进状态

## 语言规则

- 规划文档（proposal/design/tasks/verification/archive）使用简体中文
- 代码注释、测试、用户文案沿用项目现有语言

## 完成

archive 推进后 `status.json` 变为 `done`，向用户汇总重构内容和验证证据。
