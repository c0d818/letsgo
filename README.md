# LetsGo

为 Claude Code 提供的 SDD 工作流插件：把 Superpowers 式工程纪律与 OpenSpec 式
生命周期管理缝合在一起。

## 安装

### 其他人（发布后）

```bash
# 1. 安装 CLI（斜杠命令依赖）
npm install -g letsgo

# 2. 添加市场并安装插件
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
| `/lg:refactor` | 代码重构 |
| `/lg:test` | 补充测试 |
| `/lg:structure` | 查看项目结构 |
| `/lg:check` | 查看变更状态 |
| `/lg:log` | 记录运行问题 |
| `/lg:tokens` | 查看 token 用量 |
| `/lg:recover` | 从中断、压缩或残留状态恢复 |

`lg` 是插件命名空间，因此插件命令始终以 `/lg:` 开头。

## CLI

```bash
letsgo new <change-id> --type feature
letsgo select <change-id>
letsgo status --change <change-id>
letsgo validate --before|--after <state> --change <change-id>
letsgo advance <state> --change <change-id>
letsgo recover
```

## 生命周期

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

apply 阶段固定执行 RED -> GREEN -> REFACTOR，并把真实命令和结果记录到
`tdd-evidence.md`；不改变生产行为的修改必须记录明确的 TDD 豁免和验证证据。

LetsGo 使用 `openspec/.letsgo/runtime-state.json` 做当前阶段运行前检查，并用一个
覆盖更新的 `run-summary.json` 保存阶段摘要与权限、压缩、守卫拒绝指标。两者都不
按任务创建 JSON；`letsgo recover` 可在中断后恢复唯一活跃变更并清理幽灵状态。

大型项目的 clarify 分析会优先调用单一的 `codegraph_explore`，一次返回相关源码、
调用路径和影响范围，避免重复的全仓库搜索和多文件读取。

细节见 [docs/workflow.md](docs/workflow.md) 和
[docs/architecture.md](docs/architecture.md)。

## 项目跟踪

- 更新日志：`CHANGELOG.md`
- 发布流程：`VERSIONING.md`
