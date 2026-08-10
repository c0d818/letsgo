# LetsGo 版本迭代记录

本文件记录版本规划、实施进度、技术决策和发布检查。已经正式发布的变更继续记录在
`CHANGELOG.md`，这里不重复维护完整发布日志。

## 当前版本

- 版本：`0.3.0`
- 分支：`main`
- 状态：已发布；后续改动暂列入“未发布”

## 未发布

### 已完成

- `/lg:bugfix` 接收项目修复需求，并自动生成唯一的 change-id。
- apply 阶段固定执行 RED -> GREEN -> REFACTOR。
- 使用 `tdd-evidence.md` 强制记录 TDD 或有效豁免证据。
- 所有 Skill 和 Subagent 统一使用“职责、输入、执行流程、输出、边界”模板。
- 增加 Skill 和 Subagent 结构一致性自动测试。
- 接入 CodeGraph MCP，并在 clarify 阶段优先做代码图谱影响分析。

### 候选迭代

#### 轻量运行前检查

- 状态：已完成
- 目标：在启动 writer、reviewer 和推进阶段前，确认要求的 Skill 与 Subagent
  已按顺序执行。
- 建议方案：只维护一个 `openspec/.letsgo/runtime-state.json`，不创建每次任务的
  独立日志文件。
- 第一阶段范围：记录 Skill 完成、Subagent 启动/完成和 reviewer 结果。
- 暂不包含：完整审计日志、常驻监督 Subagent、硬性 token 上限和复杂预算系统。

实施结果：

- [x] 使用唯一的 `openspec/.letsgo/runtime-state.json`，不创建任务历史日志。
- [x] writer 启动前检查阶段 Skill；apply 同时检查 TDD Skill。
- [x] reviewer 启动前检查 writer 已完成。
- [x] `advance` 前检查 Skill、writer 和 reviewer 通过。
- [x] writer 重启后使旧 reviewer 结论失效。
- [x] Subagent 使用机器可读的 `LETGO_RESULT` 结果行。

#### CodeGraph 大项目上下文

- 状态：已完成
- 目标：在大型项目中减少重复 Grep、多文件读取和人工调用链拼接。
- 技术决策：插件只声明 `codegraph serve --mcp`，MCP 默认暴露单一的
  `codegraph_explore`；索引保存在项目本地 `.codegraph/`，不产生每任务日志。
- 降级策略：CLI、MCP 或索引不可用时明确回退内置工具，不阻断 LetsGo 生命周期。

实施结果：

- [x] `.mcp.json` 接入 CodeGraph stdio MCP。
- [x] clarify 优先图谱分析，并禁止机械重复读取已返回源码。
- [x] `letsgo doctor` 报告 CLI、索引和整体就绪状态。
- [x] `.codegraph/` 从当前仓库 Git 跟踪中排除。
- [x] 自动测试覆盖配置、索引检测和降级规则。

## 迭代模板

复制以下内容创建下一次迭代：

```md
## vX.Y.Z

- 状态：候选 / 设计中 / 实现中 / 验证中 / 已发布
- 目标：
- 背景：

### 范围

- 

### 不在范围内

- 

### 技术决策

- 

### 实施任务

- [ ] 

### 验证

- [ ] 自动测试通过
- [ ] `claude plugin validate . --strict` 通过
- [ ] 文档和版本号已更新
- [ ] Git 工作区干净
- [ ] 已推送 GitHub

### 风险与后续工作

- 
```

## 维护规则

1. 开始实现前先填写目标、范围和不在范围内的内容。
2. 重要方案变化写入“技术决策”，不要只保留在聊天记录中。
3. 每完成一个任务立即更新复选框。
4. 发布时更新版本号和 `CHANGELOG.md`，再把本迭代标记为“已发布”。
5. 不在此文件记录密钥、凭据、完整运行日志或用户隐私数据。
