---
description: 补充或改进测试
argument-hint: <测试需求描述>
---

# LetsGo 测试补充

使用方式：`/lg:test <测试需求描述>`。本命令固定创建 `test` 变更，默认不修改生产行为；
如果新增测试暴露真实缺陷，应另开 `/lg:bugfix`。

Required skills: `lg:letsgo-test`、`lg:letsgo-workflow`

## 1. 环境与 CodeGraph 预检

1. 运行 `letsgo doctor`，确认 LetsGo/OpenSpec 安装状态并读取 `codegraphReady`。
2. CodeGraph 可用时，用聚焦查询定位被测模块、调用路径和现有测试。
3. `codegraphExecutable: false` 时提醒
   `npm install -g @colbymchenry/codegraph`，用 `AskUserQuestion` 让用户选择安装后继续或
   本次使用 Grep/Read；不得自行全局安装。
4. CLI 已安装但 `codegraphIndexed: false` 时提醒运行 `codegraph init` 并忽略
   `.codegraph/`；让用户选择初始化或降级。降级原因要记录。
5. LetsGo/OpenSpec 不完整时停止，禁止手工补造目录。

## 2. 补齐测试目标并确认工作流

1. `$ARGUMENTS` 为空时询问：要覆盖哪个行为、目前缺少什么证据、期望使用哪类测试。
2. 补齐目标模块、目标行为/边界、现有测试、测试层级、运行命令、稳定性与覆盖判据。
3. 明确生产代码默认不可修改；若必须修改生产行为才能让测试通过，停止并建议创建
   feature 或 bugfix，由用户通过 `AskUserQuestion` 选择。
4. 生成唯一 kebab-case change-id，展示类型 `test`、覆盖缺口、范围、非目标、验收标准和
   工作流 `clarify -> design -> plan -> apply -> verify -> archive -> done`。
5. 用 `AskUserQuestion` 让用户选择“确认并创建（推荐）”或“继续修改测试目标”。

## 3. 用 LetsGo OpenSpec 命令创建变更

确认后依次执行：

```bash
letsgo new <change-id> --type test
letsgo select <change-id>
letsgo status --change <change-id>
```

必须核对 `changeDir`、`type: test` 和 `state: clarify`；禁止用 `mkdir`、Write 或脚本手工
创建 `openspec/changes/<change-id>/`。

## 4. 固定启动摘要与下一步

```text
变更位置：openspec/changes/<change-id>/
工作流：clarify -> design -> plan -> apply -> verify -> archive -> done
当前状态：clarify（测试目标与覆盖缺口确认）
下一步：加载 lg:letsgo-test、lg:letsgo-workflow 和 lg:letsgo-clarify，定义可执行的测试验收
```

随后进入统一 Workflow。Apply 对纯测试变更记录 TDD 豁免理由和实际命令；不得用虚假
RED/GREEN 包装已有行为。Verify 必须真实运行新增测试及相关回归。

## 5. 审查、阻塞与完成

- 每阶段执行 Skill -> writer（clarify 除外）-> reviewer -> validate -> advance。
- reviewer 阻塞后交回 writer 修订并重新审查；不设固定次数，但不得无变化空转。
- advance 必须确认 `advanced: true` 并重新读取 status；失败时不得创建任何后续阶段产物。
- verify 必须证明测试真实命中目标行为，且“未验证验收项：0”。
- done 后除非用户明确不提交，默认显式 `git add` 本变更路径并本地 commit；不自动 push。
- 最终汇总不超过 12 行，包含新增测试、运行结果、生产代码是否变化、提交和风险。
