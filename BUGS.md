# 缺陷（维护者内部）

本文件仅供 LetsGo 维护者内部跟踪使用，不属于面向插件用户的内容。
用户可见的已知问题不在这里记录。

## 已关闭

### BUG-0041：active 变更与 continue runtime 冲突被伪装成阶段白名单错误

- 状态：已关闭
- 严重程度：高
- 区域：恢复 / Agent 编排
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：Agent 派发先比较 runtime 与 active/status 的 change-id 和 stage；冲突时
  显示双方状态、项目根目录和精确 continue 命令，不进入普通 Agent 白名单判断。

### BUG-0040：模型把 recover 阶段摘要当成事实并派发错误阶段 Agent

- 状态：已关闭
- 严重程度：高
- 区域：恢复 / Agent 编排
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：`recover` 返回 `stageSource`、阶段和唯一的 `/lg:continue` 交接命令，并明确
  禁止直接派发；Agent 名称门禁拒绝时同时显示权威 `status.json` 和正确恢复动作。

### BUG-0039：插件与全局 LetsGo CLI 版本漂移导致 continue 未知

- 状态：已关闭
- 严重程度：高
- 区域：插件打包 / CLI 分发
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：新增插件标准 `bin/letsgo` 可执行文件并纳入包内容，Claude Code 启用插件时
  自动加入 Bash PATH；npm bin 同样指向该入口，不再要求用户另装可能过期的全局 CLI。

### BUG-0038：LetsGo 只读命令附带 stderr 重定向时误弹写入批准

- 状态：已关闭
- 严重程度：中
- 区域：Bash Guard / 命令识别
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：命令分类前精确移除 `2>&1`、`1>&2` 和指向 `/dev/null`/`NUL` 的安全
  诊断重定向；重定向到普通文件仍按写入处理，不扩大自动放行范围。

### BUG-0037：后台 Agent 完成后缺少 SubagentStop 导致 runtime 永久 started

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Claude Code 后台 Agent
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：保留标准 `SubagentStop` 路径，同时在下一次 Agent PreToolUse 前检查上一后台
  Agent 的独立 transcript；发现合法最终 `LETGO_RESULT` 时补记停止结果，再执行顺序和
  重复启动判断。兼容升级前未保存 transcript 路径的 `started` 状态。

### BUG-0036：Apply partial 协议被误判并造成重复派发假象

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Apply 编排
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：Apply Writer 的运行前协议校验同时接受完整的 `partial` 与 `ready`，不再把
  合法检查点误报为缺少 `ready`；任何 Writer/Reviewer 仍为 `started` 时禁止再次启动，
  防止同一角色真实并发。

### BUG-0035：旧式 Task 派发入口绕过 Agent 名称门禁

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Agent 编排
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：`Agent` 与旧式 `Task` 派发工具统一接入同一个 Pre/PostToolUse Hook 和
  阶段白名单；所有阶段 Skill 的派发名称与 `agents/*.md` 做全仓一致性测试，且全部
  Agent 定义禁止拥有 `Agent`/`Task` 二次派发工具。

### BUG-0034：记录别名被错误接受为 Agent 派发名

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Agent 定义加载
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：PreToolUse 用完整 Agent 名白名单校验，确保宿主加载对应 `agents/*.md`；
  已知短名仅用于 Start/Stop/结果事件归一化，不能参与派发授权。

### BUG-0033：未知 Agent 被当作非 LetsGo Agent 放行

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Agent 编排
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：严格 Agent PreToolUse 使用阶段白名单；未知、无命名空间、错误阶段和缺失
  Agent 类型全部拒绝并返回当前允许名称。精确兼容别名继续归一化，普通非严格调用不受
  影响。

### BUG-0032：Apply Writer 超时后未续派且过早进入校验

- 状态：已关闭
- 严重程度：高
- 区域：Apply 编排 / Runtime 门禁
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：Apply 按单任务 Cycle 持久化检查点并循环续派；新增 `partial` 结果和
  `remainingTasks`，runtime 在接受 `ready` 前独立运行 apply 产物校验，不完整时记录
  `incomplete` 并禁止 reviewer/advance。

### BUG-0031：CodeAgent3 reviewer 短名导致审查结果丢失

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / Agent 身份归一化
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：将 CodeAgent3 生命周期事件中的 `lg:review` 精确映射到
  `lg:letsgo-reviewer`；覆盖完整名启动、短名结束的真实混合事件，确保 pass 和次数写入
  同一个 runtime 槽位，同时不放宽 Node Guard。

### BUG-0030：Bash 引号路径和 Windows 反斜杠路径被误判为无路径

- 状态：已关闭
- 严重程度：高
- 区域：Guard / Bash 路径解析
- 首次发现：2026-08-14
- 关闭时间：2026-08-14
- 解决方式：新增保留引号参数边界的 Shell tokenizer，兼容 Windows 绝对/相对路径
  解析；回归测试覆盖带空格项目目录和反斜杠路径，同时保留真实无路径写命令的确认。

### BUG-0029：Windows 路径未命中 Clarify 的 proposal 精确白名单

- 状态：已关闭
- 严重程度：高
- 区域：Guard / Windows 路径
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：路径比较按 Windows 语义规范化盘符、分隔符和大小写；新增三种 Windows
  路径形式的 proposal 放行测试，并确认 verification 仍被拒绝。

### BUG-0028：正常重启只能 recover，导致有效 runtime 被清空

- 状态：已关闭
- 严重程度：高
- 区域：中断恢复 / 生命周期编排
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：新增 continue 和显式 runtime handoff；保留同阶段 Skill/Agent 证据并返回
  下一动作。recover 只用于损坏状态，blocked 次数和 reviewer 结果不会被静默重置。

### BUG-0027：只读 Reviewer 结果被误当成文件写入且未回传 runtime

- 状态：已关闭
- 严重程度：高
- 区域：Reviewer / CodeAgent3 Agent Hook
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：协议只作为 reviewer 最终响应；runtime Hook 同时从 SubagentStop 和
  PostToolUse(Agent) 提取结果。推进后必须核对 `advanced: true` 与实际状态，失败时
  不得创建未来阶段产物。

### BUG-0026：Clarify 误拦当前变更目录授权及包装后的 advance

- 状态：已关闭
- 严重程度：高
- 区域：Guard / CodeAgent3 兼容
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：允许 `ExternalDirectory` 访问当前活跃变更目录，同时继续逐文件执行阶段
  白名单；LetsGo CLI 识别补充含空格 Node 入口和 Windows `.cmd` 包装，禁止复合命令。

### BUG-0025：CodeAgent3 Skill 完成事件未写入 runtime-state

- 状态：已关闭
- 严重程度：高
- 区域：Runtime Hook / CodeAgent3 兼容
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：runtime-state、context、metrics 和 Guard Hook 统一读取 snake_case 与
  camelCase 输入；补充真实 camelCase PostToolUse 回归测试，验证 Skill 被记为 loaded。

### BUG-0024：Clarify 两轮审查阻塞后只能手动批准或错误退回

- 状态：已关闭
- 严重程度：高
- 区域：Reviewer 门禁 / 阶段恢复
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：禁止手动批准未通过产物；两轮有效审查仍阻塞时展示第二轮阻塞项，经
  用户授权后允许 `reopen` 重开当前阶段审查周期，并保留旧 reviewer 审计证据。

### BUG-0023：CodeAgent3 Write 参数导致合法 proposal 写入被误拦截

- 状态：已关闭
- 严重程度：高
- 区域：Guard / CodeAgent3 兼容
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：`toolPaths()` 同时识别 snake_case 与 camelCase 文件路径字段；补充
  clarify 合法写入和跨阶段拒绝测试，确保兼容不扩大权限范围。

### BUG-0022：Windows 含空格的插件路径导致 SessionStart 加载失败

- 状态：已关闭
- 严重程度：高
- 区域：Hook / Windows 路径兼容
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：所有 Hook 命令统一使用
  `${CLAUDE_PLUGIN_ROOT:-${CODEAGENT3_PLUGIN_ROOT}}` 并引用完整脚本路径，兼容两个
  宿主环境；用自动测试约束全部 Hook 入口，防止路径含空格时 Node 截断入口。

### BUG-0021：Reviewer prompt 重复协议门禁阻止正常派发

- 状态：已关闭
- 严重程度：高
- 区域：Subagent 编排 / Guard
- 首次发现：2026-08-13
- 关闭时间：2026-08-13
- 解决方式：Agent 定义成为 `LETGO_RESULT` 协议唯一来源，最小派发 prompt 不再复制
  JSON；仅当 prompt 主动提供协议时校验完整性并拒绝旧格式。同时放行只读 grep 的
  `/dev/null` 重定向，普通文件重定向继续视为写入。

### BUG-0020：done 后暂存验收链仍被 Guard 阻止

- 状态：已关闭
- 严重程度：高
- 区域：运行时守卫
- 首次发现：2026-08-12
- 关闭时间：2026-08-12
- 解决方式：安全交付链加入精确的只读 Git 验收步骤，支持
  `git add && git diff --cached --stat`、`git commit && git show --stat` 及完整三段顺序；
  其他 shell 链继续拒绝。

### BUG-0019：.letsgo 路径被误识别为 LetsGo CLI 命令

- 状态：已关闭
- 严重程度：高
- 区域：运行时守卫
- 首次发现：2026-08-12
- 关闭时间：2026-08-12
- 解决方式：CLI 例外只匹配命令行开头的 `letsgo` 可执行程序；done 后的
  `issues.md` 例外同时限制为 Write/Edit 类工具，Bash 删除和其他操作继续走正常
  Guard 判定。

### BUG-0018：done 后 Git 收尾和问题记录仍被 Guard 阻止

- 状态：已关闭
- 严重程度：高
- 区域：运行时守卫
- 首次发现：2026-08-12
- 关闭时间：2026-08-12
- 解决方式：Guard 仅在检测到六阶段均完成并批准的 `done` 变更时开放本地交付，
  支持安全的单条或 `git add && git commit` 链及 Claude Code 标准 quoted-heredoc
  提交信息；同时保留 `issues.md` 记录权限。无完成变更、普通写入、push、额外 shell
  链和 amend/fixup/squash 仍不放行。

### BUG-0017：生命周期完成后仍可能不提交且重复输出汇总

- 状态：已关闭
- 严重程度：中
- 区域：命令编排
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：完成后默认验证并创建作用域明确的本地提交（用户明确拒绝时除外），
  不自动 push；最终只输出一次不超过 12 行的摘要。

### BUG-0016：权限提示指标混入 AskUserQuestion 澄清题

- 状态：已关闭
- 严重程度：中
- 区域：可观测性
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：将澄清问题记录为 `clarificationQuestions`，仅真实工具权限请求计入
  `permissionPrompts`；另记录 `codeGraphQueries`。

### BUG-0015：verify 可在浏览器验收待办时错误通过

- 状态：已关闭
- 严重程度：高
- 区域：验证门禁
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：验证模板新增验收状态，状态校验要求“未验证验收项：0”，任何待手动或
  浏览器验证描述均阻止推进 archive。

### BUG-0014：Agent 名称和结果协议漂移导致重复派发

- 状态：已关闭
- 严重程度：高
- 区域：Subagent 编排
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：Agent PreToolUse 强制完整 `lg:` 命名空间并校验 prompt 中的阶段、角色
  和完整协议；拒绝 `LETGO_RESULT:` 旧协议，token 报告归一历史别名。

### BUG-0013：reviewer 可被无限重新派发

- 状态：已关闭
- 严重程度：高
- 区域：Subagent 编排
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：运行状态累计启动次数，每个阶段最多初审一次、writer 修订后复审一次；
  第三次启动被 Hook 拒绝。

### BUG-0012：CodeGraph 文字约束未阻止第三次查询

- 状态：已关闭
- 严重程度：高
- 区域：CodeGraph / Hooks
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：为 `codegraph_explore` 增加 PreToolUse Hook，以 run-summary 的实际放行
  次数为准拒绝第三次查询；零结果立即降级到 Read/Grep。

### BUG-0011：完成后的 Git 交付被守卫阻止并诱发递归维护变更

- 状态：已关闭
- 严重程度：高
- 区域：运行时守卫
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：生命周期完成后放行安全的本地 `git add`/`git commit`，拒绝 amend、
  fixup、squash 和 shell 串联；push 继续请求批准，并禁止通过临时脚本或新维护变更绕过。

### BUG-0010：archive 后遗留 active 和幽灵 runtime

- 状态：已关闭
- 严重程度：高
- 区域：状态恢复
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：archive 完成后清理 active/runtime；新增 `letsgo recover`，依据
  `status.json` 恢复唯一活跃变更或清除残留状态。

### BUG-0009：token 快照累加导致用量虚高且无法按阶段观察

- 状态：已关闭
- 严重程度：中
- 区域：可观测性
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：报告改为覆盖最新快照、合并同类 Subagent 调用，并按 run-summary
  的阶段时间窗计算增量。

### BUG-0008：无法统计权限提示、压缩和重复守卫拒绝

- 状态：已关闭
- 严重程度：中
- 区域：Hooks / 可观测性
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：新增 PermissionRequest、PermissionDenied、PreCompact、PostCompact
  Hook，并统一写入单一 `run-summary.json`。

### BUG-0007：Skill 加载被误记为阶段完成

- 状态：已关闭
- 严重程度：高
- 区域：运行时编排
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：Skill 状态改为 `loaded`；writer/reviewer 必须返回包含证据、风险和
  变更文件/阻塞项的结构化结果，advance 再结合产物校验推进。

### BUG-0006：clarify 首问只宣布问题但没有实际提问

- 状态：已关闭
- 严重程度：高
- 区域：clarify
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：首问必须在同一回复直接输出完整问题和选项；恢复时从第一个未回答问题继续。

### BUG-0005：proposal 写入失败后重复尝试并绕过守卫

- 状态：已关闭
- 严重程度：高
- 区域：守卫 / clarify
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：相同拒绝记录重复次数并明确停止；写入失败只允许检查一次原因，不得用 Bash
  或临时脚本绕过；proposal 通过文件校验后才能启动 reviewer。

### BUG-0004：Subagent 输出冗长、语言和机器协议混杂

- 状态：已关闭
- 严重程度：中
- 区域：Subagent 模板
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：所有 Subagent 输出限制为精简中文摘要，路径/命令/错误保持原样，最后一行
  统一为英文 `LETGO_RESULT` JSON；初审后最多复审一次。

### BUG-0003：变更创建失败可能留下或覆盖不完整目录

- 状态：已关闭
- 严重程度：中
- 区域：CLI 状态机
- 首次发现：2026-08-11
- 关闭时间：2026-08-11
- 解决方式：先在同级临时目录完整生成再原子 rename；已有目录缺少 `status.json` 时
  明确报错且保留用户文件。

### BUG-0002：Hook 输出缺少事件名称导致运行时校验失败

- 状态：已关闭
- 严重程度：高
- 区域：Claude Code Hooks
- 首次发现：2026-08-10
- 关闭时间：2026-08-10
- 解决方式：为 `SessionStart`、`UserPromptSubmit` 和 `PreToolUse` 的
  `hookSpecificOutput` 补齐对应的 `hookEventName`，并加入回归测试。

### BUG-0001：迁移后可能残留空的旧目录

- 状态：已关闭
- 严重程度：低
- 区域：仓库清理
- 首次发现：2026-07-31
- 关闭时间：2026-08-03
- 解决方式：把仓库重构为插件优先结构，移除旧的 `src/`、`bin/` 和
  `opencode/plugins/` 路径。
