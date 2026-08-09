# Stitches

为 Claude Code 提供的 SDD 工作流插件：把 Superpowers 式工程纪律与 OpenSpec 式
生命周期管理缝合在一起。

## 安装

### 其他人（发布后）

```bash
# 1. 安装 CLI（斜杠命令依赖）
npm install -g stitches

# 2. 添加市场并安装插件
/plugin marketplace add c0dgod/stitches
/plugin install stitches@stitches
```

也可以直接从 GitHub 安装：

```bash
/plugin install c0dgod/stitches@github
```

### 本地开发

```bash
cc --plugin-dir /Users/gc0d/harness/stitches
# 或注册本地市场
/plugin marketplace add /Users/gc0d/harness/stitches
/plugin install stitches@stitches
```

也可以在项目的 `.claude/settings.json` 中加入：

```json
{
  "plugins": ["file:///Users/gc0d/harness/stitches"]
}
```

`stitches init <project>` 会把命令、技能、代理安装到项目本地（`.claude/`）。

## 发布

```bash
git push origin main
npm publish
```

## 命令

| 命令 | 简介 |
| --- | --- |
| `/stitches:start` | 实现需求 |
| `/stitches:bugfix` | 修复缺陷 |
| `/stitches:refactor` | 代码重构 |
| `/stitches:test` | 补充测试 |
| `/stitches:letsgo` | 一键自动流程 |
| `/stitches:structure` | 查看项目结构 |
| `/stitches:check` | 查看变更状态 |
| `/stitches:log` | 记录运行问题 |
| `/stitches:tokens` | 查看 token 用量 |

无冲突时可直接输入 `/start` 等短名。

## CLI

```bash
stitches new <change-id> --type feature
stitches select <change-id>
stitches status --change <change-id>
stitches validate --before|--after <state> --change <change-id>
stitches advance <state> --change <change-id>
```

## 生命周期

```text
clarify -> design -> plan -> apply -> verify -> archive -> done
```

细节见 [docs/workflow.md](docs/workflow.md) 和
[docs/architecture.md](docs/architecture.md)。

## 项目跟踪

- 更新日志：`CHANGELOG.md`
- 发布流程：`VERSIONING.md`
