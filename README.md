# LetsGo

为 Claude Code 提供的 SDD 工作流插件：把 Superpowers 式工程纪律与 OpenSpec 式
生命周期管理缝合在一起。

## 安装

### 其他电脑

```bash
# 插件自带同版本 letsgo CLI，无需另装全局 npm 包
/plugin marketplace add c0dgod/letsgo
/plugin install lg@letsgo
```

也可以直接从 GitHub 安装：

```bash
/plugin install c0dgod/letsgo@github
```

### 本地开发

```bash
cc --plugin-dir /Users/gc0d/harness/letsgo
# 或注册本地市场
/plugin marketplace add /Users/gc0d/harness/letsgo
/plugin install lg@letsgo
```

也可以在项目的 `.claude/settings.json` 中加入：

```json
{
  "plugins": ["file:///Users/gc0d/harness/letsgo"]
}
```

`letsgo init <project>` 会把命令、技能、代理安装到项目本地（`.claude/`）。
插件根目录的 `bin/letsgo` 会由 Claude Code 自动加入 Bash PATH，确保 Slash Command、
Hook 和 CLI 始终来自同一个插件版本。只有脱离插件单独使用 CLI 时，才需要从当前仓库
执行 `npm install -g .`。

### CodeGraph（大项目推荐）

LetsGo 已声明 CodeGraph MCP，不需要再手写 Claude 配置。每台开发机安装一次 CLI，
每个项目建立一次本地索引：

```bash
npm install -g @colbymchenry/codegraph
cd <project>
codegraph init
```

`.codegraph/` 是自动同步的本地 SQLite 索引，应加入项目 `.gitignore`，不要提交。
`letsgo doctor <project>` 会报告 `codegraphExecutable`、`codegraphIndexed` 和
`codegraphReady`。未安装或未建索引时，LetsGo 会明确降级到内置的 `Grep`、
`Read`，不会中断工作流。
每次 clarify 最多放行两次聚焦查询，第三次由 Hook 直接拒绝并记录到单一运行摘要。

## 发布

```bash
git push origin main
npm publish
```

## 命令

| 命令 | 简介 |
| --- | --- |
| `/lg:letsgo` | 一键自动流程 |
| `/lg:start` | 实现需求 |
| `/lg:bugfix` | 根据修复需求描述修复缺陷 |
| `/lg:refactor` | 根据重构需求描述创建行为保持的重构变更 |
| `/lg:test` | 根据测试需求描述创建仅测试变更 |
| `/lg:structure` | 查看项目结构 |
| `/lg:check` | 查看变更状态 |
| `/lg:log` | 记录运行问题 |
| `/lg:tokens` | 查看 token 用量 |
| `/lg:recover` | 修复损坏或残留的运行状态 |
| `/lg:continue` | 从退出、重启或模型切换后的断点安全续跑 |
| `/lg:reopen` | 经用户确认后把阻塞变更退回更早阶段 |

`lg` 是插件命名空间，因此插件命令始终以 `/lg:` 开头。

## CLI

```bash
letsgo new <change-id> --type feature
letsgo select <change-id>
letsgo status --change <change-id>
letsgo validate --before|--after <state> --change <change-id>
letsgo advance <state> --change <change-id>
letsgo recover
letsgo continue [change-id]
letsgo reopen <state> --change <change-id> --reason "<人工解除理由>"
```

## 生命周期

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

apply 阶段固定执行 RED -> GREEN -> REFACTOR，并把真实命令和结果记录到
`tdd-evidence.md`；不改变生产行为的修改必须记录明确的 TDD 豁免和验证证据。

LetsGo 使用 `openspec/.letsgo/runtime-state.json` 做当前阶段运行前检查，并用一个
覆盖更新的 `run-summary.json` 保存阶段摘要与权限、压缩、守卫拒绝指标。两者都不
按任务创建 JSON；正常退出、重启、压缩或模型切换后使用 `letsgo continue` 保留有效
阶段证据并从缺失步骤续跑；`letsgo recover` 仅用于清理幽灵或损坏状态。
reviewer 或验收在后期发现真实遗漏时，`letsgo reopen` 经用户明确确认后撤销目标阶段
及其后的批准，同时把旧审查结果保留在现有状态与运行摘要中；不得手改状态或另建
变更掩盖原验收缺口。

大型项目的 clarify 分析会优先调用单一的 `codegraph_explore`，一次返回相关源码、
调用路径和影响范围，避免重复的全仓库搜索和多文件读取。

细节见 [docs/workflow.md](docs/workflow.md)、
[docs/architecture.md](docs/architecture.md) 和
[docs/design-decisions.md](docs/design-decisions.md)。设计决策文档集中记录每条关键规则的
实测依据、代价、例外和重新评估条件。

## 项目跟踪

- 更新日志：`CHANGELOG.md`
- 发布流程：`VERSIONING.md`
- 设计理由：`docs/design-decisions.md`
