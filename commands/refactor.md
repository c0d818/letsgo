---
description: 代码重构
argument-hint: <重构需求描述>
---

# LetsGo 重构

使用方式：`/lg:refactor <重构需求描述>`。本命令固定创建 `refactor` 变更；如果目标是
修复外部可观察错误，应改用 `/lg:bugfix`。

Required skills: `lg:letsgo-refactor`、`lg:letsgo-workflow`

## 1. 环境与 CodeGraph 预检

1. 在项目根目录运行 `letsgo doctor` 并检查安装与 OpenSpec 状态。
2. 读取 `codegraphReady`：
   - 可用时报告“CodeGraph：可用”，clarify 用聚焦查询确认依赖、调用方和影响范围。
   - `codegraphExecutable: false` 时提醒
     `npm install -g @colbymchenry/codegraph`，通过 `AskUserQuestion` 让用户选择安装后继续
     或本次降级到 Grep/Read；不得自行安装。
   - CLI 存在但未索引时提醒运行 `codegraph init`，并把 `.codegraph/` 加入
     `.gitignore`；让用户选择初始化或降级。
3. LetsGo/OpenSpec 缺失时停止；CodeGraph 降级时记录原因并继续，不伪造图谱结论。

## 2. 补齐重构契约并确认工作流

1. `$ARGUMENTS` 为空时询问：要调整什么结构、为什么调整、哪些外部行为必须保持不变。
2. 信息不足时逐项补齐：目标模块、允许修改范围、禁止改变的 API/数据/副作用、兼容性
   要求、当前基线测试和完成判据。
3. 若请求实际包含新行为或错误修复，向用户指出类型冲突并用 `AskUserQuestion` 确认改用
   feature/bugfix，不能静默改变类型。
4. 生成唯一 kebab-case change-id，展示类型 `refactor`、目标结构、行为不变量、范围边界、
   基线验证、验收标准和工作流
   `clarify -> design -> plan -> apply -> verify -> archive -> done`。
5. 用 `AskUserQuestion` 让用户选择“确认并创建（推荐）”或“继续修改重构契约”。

## 3. 用 LetsGo OpenSpec 命令创建变更

确认后依次运行：

```bash
letsgo new <change-id> --type refactor
letsgo select <change-id>
letsgo status --change <change-id>
```

禁止用文件工具手工创建变更目录。必须核对返回的 `changeDir`、`type: refactor`、
`state: clarify`。

## 4. 固定启动摘要与下一步

```text
变更位置：openspec/changes/<change-id>/
工作流：clarify -> design -> plan -> apply -> verify -> archive -> done
当前状态：clarify（重构契约与行为不变量确认）
下一步：加载 lg:letsgo-refactor、lg:letsgo-workflow 和 lg:letsgo-clarify，固化行为不变性验收
```

随后进入统一 Workflow。Design 必须包含迁移/回滚方案，Apply 不得引入新业务行为，
Verify 必须用重构前后对照证据证明行为等价。

## 5. 审查、阻塞与完成

- 每阶段顺序为 Skill -> writer（clarify 除外）-> reviewer -> validate -> advance。
- reviewer 初审阻塞后最多再派发一次；第二次仍阻塞就停止，不能手动批准。
- advance 必须同时满足 `advanced: true` 和 status 已进入下一阶段；失败时不得创建任何
  后续阶段产物。
- verify 必须全量回归且“未验证验收项：0”，不能只证明新结构能编译。
- done 后除非用户明确不提交，默认显式 `git add` 本变更路径并本地 commit；不自动 push。
- 最终汇总不超过 12 行，包含行为不变量证据、结构变化、提交和风险。
