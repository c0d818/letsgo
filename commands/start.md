---
description: 实现需求
argument-hint: <change-id>
---

# Stitches 新需求

使用方式：`/start <change-id>`

`<change-id>` 是 `$ARGUMENTS` 的第一个参数。

## 总览

按顺序执行完整 SDD 生命周期，不得跳过或改变顺序：

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

每个阶段统一执行四步：

1. 开始校验：`stitches validate --before <state> --change <change-id>`
2. 读取并执行该阶段 Skill（见“阶段明细”）
3. 完成校验：`stitches validate --after <state> --change <change-id>`
4. 推进：`stitches advance <state> --change <change-id>`

校验或审查失败时立即停止并报告，不进入下一阶段，不手动修改 `status.json`。

## 前置

如果变更不存在，先执行：

```bash
stitches new <change-id> --type feature
stitches select <change-id>
```

然后读取 `stitches-feature` 场景 Skill，确认类型特定要求（模板与产物要求）。

## 阶段明细

### 1. clarify（需求澄清）

- Skill：`stitches-clarify`（主 Agent 完成，不派发 subagent）
- 流程：需求问答 -> 用户确认摘要 -> CodeGraph 代码影响 -> Context7 外部知识
  -> 头脑风暴方案 -> 用户确认方案 -> DeepReview -> 写入 `proposal.md`
- 本阶段不修改生产代码、测试代码或设计文档。

### 2. design（技术设计）

- Skill：`stitches-design`
- 派发 subagent：`@stitches-design-writer` -> `@stitches-reviewer`
- 产物：`design.md`，必要时更新 `specs/**`

### 3. plan（任务规划）

- Skill：`stitches-plan`
- 派发 subagent：`@stitches-plan-writer` -> `@stitches-reviewer`
- 产物：`tasks.md`（复选框任务）

### 4. apply（实现变更）

- Skill：`stitches-apply`
- 派发 subagent：`@stitches-apply-writer` -> `@stitches-reviewer`
- 测试优先；产物：生产/测试文件、完成的任务清单

### 5. verify（验证审查）

- Skill：`stitches-verify`
- 派发 subagent：`@stitches-verify-writer` -> `@stitches-reviewer`
- 产物：`verification.md`，必须包含真实证据和“状态：通过”

### 6. archive（归档沉淀）

- Skill：`stitches-archive`
- 派发 subagent：`@stitches-archive-writer` -> `@stitches-reviewer`
- 产物：长期规格更新、`archive.md`

## Subagent 编排规则

- 每个阶段 Skill 负责派发 subagent，顺序固定：
  `<阶段>-writer -> stitches-reviewer -> 主 Agent 校验并推进`
- reviewer 不通过时，把问题交回当前 writer 修复，再重新派发 reviewer
- reviewer 不能修改文件，也不能推进状态

## 语言规则

- 规划文档（proposal/design/tasks/verification/archive）使用简体中文
- 代码注释、测试、用户文案沿用项目现有语言

## 完成

archive 推进后 `status.json` 变为 `done`，向用户汇总变更内容和验证证据。
