# LetsGo 版本迭代记录

本文件记录版本规划、实施进度、技术决策和发布检查。已经正式发布的变更继续记录在
`CHANGELOG.md`，这里不重复维护完整发布日志。

## 当前版本

- 版本：`0.4.25`
- 分支：`main`
- 状态：本地验证完成

## 未发布

### 已完成

- Apply Writer 的完整 `partial` 和 `ready` 协议均可通过运行前校验；运行中的同角色
  Agent 不允许重复启动，区分逐任务顺序续派与真实并发重复。

- 所有 Subagent 派发入口统一执行完整规范名白名单：现代 `Agent` 与旧式 `Task` 都受
  同一 Hook 控制；阶段 Skill 与 Agent 文件通过全仓一致性测试防止名称漂移和嵌套派发。

- Agent 派发必须使用与 `agents/*.md` 对应的完整规范名；`lg:review` 等短名只在宿主
  生命周期事件回传时归一化，不能作为派发名绕过专属指令加载。

- Agent PreToolUse 使用当前阶段精确白名单，禁止 MiniMax 等模型随意派发
  `general-purpose`、错误阶段或无名 Agent；保留明确的 reviewer 兼容别名。

- 四个类型 Command 使用具体启动协议：doctor/CodeGraph 检查、需求契约补全与确认、
  OpenSpec 创建、状态核对和四项交接摘要；共享生命周期继续由 Workflow Skill 维护。

- Apply 按未完成任务逐项续派 Writer 并保存 TDD Cycle 检查点；超时、截断和 `partial`
  不进入 reviewer。runtime 独立复验伪 `ready`，`/lg:continue` 可继续剩余任务。

- 将 CodeAgent3 记录的 reviewer 短名 `lg:review` 归一化到规范名
  `lg:letsgo-reviewer`，避免有效审查结果丢失和 advance 假阻塞；不放宽 Node 权限。

- Guard 的 Bash tokenizer 保留引号路径并兼容 Windows 反斜杠绝对/相对路径，避免
  合法阶段文件被误报“未看到文件路径”；真实无目标路径的写命令继续要求确认。

- Guard 跨平台规范化 Windows 盘符、反斜杠和大小写，确保 clarify 精确放行变更根目录
  的 `proposal.md`；拒绝信息同时显示当前阶段允许的主产物。

- 新增 `/lg:continue [change-id]` 与 `letsgo continue`：正常重启后保留同阶段有效
  runtime，以显式 handoff 交给新 session，并返回精确断点动作；recover 仅处理损坏状态。

- reviewer 的 `LETGO_RESULT` 只从最终对话响应回传，不写阶段文件；CodeAgent3 可从
  `PostToolUse(Agent).toolResponse` 记录结果。advance 后强制核对成功标记与状态。

- Guard 兼容 CodeAgent3 的当前变更目录授权，并识别含空格 Node 路径和 Windows
  `.cmd` 包装的 LetsGo CLI；实际文件写入仍遵循阶段白名单。

- 所有 Hook 统一兼容 CodeAgent3 camelCase 事件字段和项目目录环境变量，修复 Skill
  已执行但 `runtime-state.json.skills` 仍为空的问题，并覆盖 Agent 生命周期字段。

- reviewer 两轮有效审查仍阻塞时，禁止手动批准产物；展示第二轮阻塞项，并允许用户
  授权 `reopen` 重开当前阶段审查周期，保留旧证据后重新执行完整门禁。

- Guard 同时识别 Claude Code 的 `file_path` / `notebook_path` 与 CodeAgent3 的
  `filePath` / `notebookPath`，修复合法 Write 被误报“未看到文件路径”的问题。

- 统一用户提问策略：有限选项由主 Agent 调用 `AskUserQuestion`，无法合理枚举的
  自由文本才普通提问；Subagent 只上报阻塞问题和候选选项，不直接询问用户。

- 为所有 Hook 使用 `${CLAUDE_PLUGIN_ROOT:-${CODEAGENT3_PLUGIN_ROOT}}` 根目录回退并
  引用完整脚本路径，兼容两个宿主及 Windows 含空格的本地 Marketplace 安装目录。

- 将 Agent 定义设为结果协议唯一来源，允许最小派发 prompt；修复只读 grep 携带
  `/dev/null` 重定向时被误判为写入的问题。

- 修复生命周期进入 `done` 且 active 标记被清除后，Git 收尾和问题记录被 Guard
  错误阻止；权限只对完整批准的完成变更开放，并保持 push、历史改写和普通业务写入
  受限。

- 兼容读取 0.4.0 旧运行摘要并补齐新增指标默认值。
- 用 Hook 对 CodeGraph 两次上限实施硬门禁并记录真实查询数。
- Agent prompt 预检完整命名空间、阶段/角色和 `LETGO_RESULT` 契约。
- reviewer 硬限制为初审加一次复审；verify 硬要求零未验收项。
- 区分澄清提问和真实权限批准，统一历史 Subagent 名称统计。
- 生命周期完成后默认本地提交，并约束为一次简洁最终汇总。

- `/lg:bugfix` 接收项目修复需求，并自动生成唯一的 change-id。
- apply 阶段固定执行 RED -> GREEN -> REFACTOR。
- 使用 `tdd-evidence.md` 强制记录 TDD 或有效豁免证据。
- 所有 Skill 和 Subagent 统一使用“职责、输入、执行流程、输出、边界”模板。
- 增加 Skill 和 Subagent 结构一致性自动测试。
- 接入 CodeGraph MCP，并在 clarify 阶段优先做代码图谱影响分析。
- 修正 Skill “加载即完成”、clarify 首问提前结束和 proposal 写入死循环。
- 增加单文件运行摘要、权限/压缩指标、恢复命令和阶段 token 增量。
- 允许完成生命周期后的本地 Git 交付，禁止递归创建维护变更绕过守卫。
- 变更创建原子化，并在 archive 后清理 active/runtime 残留状态。

### 候选迭代

#### 轻量运行前检查

- 状态：已完成
- 目标：在启动 writer、reviewer 和推进阶段前，确认要求的 Skill 与 Subagent
  已按顺序执行。
- 建议方案：当前门禁使用 `runtime-state.json`，生命周期摘要使用一个覆盖更新的
  `run-summary.json`，不创建每次任务的独立日志文件。
- 第一阶段范围：记录 Skill 完成、Subagent 启动/完成和 reviewer 结果。
- 暂不包含：完整审计日志、常驻监督 Subagent、硬性 token 上限和复杂预算系统。

实施结果：

- [x] 使用 `runtime-state.json` + 单一 `run-summary.json`，不创建任务历史日志。
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
