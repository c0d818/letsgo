---
description: 查看项目结构
---

# 查看项目结构

这是一个只读命令，用于快速了解整个项目的目录结构和关键文件。

## 执行步骤

1. 列出项目结构，排除无关目录和文件：
   - 排除 `node_modules`、`.git`、`dist`、`build`、`coverage`、`*.log`、
     `.DS_Store` 等生成物或系统文件
   - 可用 `tree -a -I 'node_modules|.git|dist|build|coverage'`，没有 `tree`
     时用 `find` 或 `rg --files` 代替
2. 按目录分组整理成树状结构，并标注关键内容：
   - 入口文件（`package.json`、`main`、`CLAUDE.md`、`README.md` 等）
   - 配置文件
   - 主要源码目录及其职责
3. 如果项目有 `openspec/`，额外列出：
   - 活跃变更（读取 `openspec/changes/*/status.json`，列出 ID、类型、当前阶段）
   - 可用变更类型模板
4. 向用户输出完整的项目结构总览，保持简洁，按重要程度组织。

不要修改任何文件。
