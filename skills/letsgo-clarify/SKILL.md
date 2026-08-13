---
name: letsgo-clarify
description: 在 LetsGo clarify 阶段澄清需求、分析影响、比较方案并完成反向审查
user-invocable: false
---

# LetsGo Clarify

## 职责

把 feature、bugfix、refactor、test 或 maintenance 的模糊需求整理为可进入设计
阶段的 `proposal.md`。

## 输入

- 用户的原始需求；只有 `change-id` 不算有效需求输入
- 当前项目代码、规格、测试和约束
- 当前变更的类型、`change-id` 和 `status.json`

## 执行流程

1. 按“一次一题”澄清需求。直接调用提问工具并在同一次响应中完整给出问题与
   2 到 4 个编号选项；不要只输出“第一题：”或预告后结束。在最佳选项后标注
   “（推荐）”，并保留“其他（请说明）”。能从项目或上下文推断的信息不要问。
   中断或恢复后从尚未回答的问题继续，不重复代码分析。
2. 至少确认问题、目标用户、期望行为、范围、完成标准、约束和兼容性要求。
3. 用简短摘要复述需求并等待用户确认；确认前不创建或填写 `proposal.md`。
4. 对代码行为变更，若项目存在 `.codegraph/` 且 `codegraph_explore` 可用，默认只用
   一次聚焦查询获取相关源码、调用路径、影响范围和测试线索；把返回的源码视为
   已读，不再用文件遍历重复验证。只有第一次结果明确缺少关键调用边时才允许第二次
   查询，并把原因写入 proposal；若首次结果为零匹配则直接降级 Read/Grep，不得以换关键词
   重试；不得调用第三次（运行时也会硬拒绝）。索引或工具不可用时记录降级原因，
   再使用 `Grep`、`Read` 等内置工具检查相关模块、调用方、数据流和现有测试。
5. 涉及框架、库、API、协议、配置格式或版本行为时，查询当前可用的官方文档；
   记录版本、约束和关键结论。纯内部逻辑可跳过并说明原因。
6. 除极小文字或配置修改外，至少比较 3 个候选方案；不足 3 个时说明原因。
   每个方案说明做法、影响文件、成本、风险和适用条件，并给出推荐与取舍。
7. 展示候选方案并等待用户确认；确认前不继续。
8. 起草 `proposal.md` 并确认 `letsgo validate --after clarify` 的产物检查通过后，
   派发 `@lg:letsgo-reviewer` 做只读反向审查，检查目标
   遗漏、未经验证的假设、兼容性、权限、安全、性能、测试、迁移和回滚风险。
   派发 prompt 只传当前阶段、change-id、目标文件、验收标准和风险重点；完整
   `LETGO_RESULT` 协议由 reviewer Agent 定义统一维护。不得在 prompt 中覆盖协议；
   若确需提及机器结果，只写协议名称，不复制 JSON 或使用 `LETGO_RESULT:` 旧格式。
9. 审查不通过时修订草稿并只复审一次；第二次仍阻塞时停止并报告，不得第三次启动 reviewer。
10. 由主 Agent 运行 `letsgo validate --after clarify --change <change-id>` 和
    `letsgo advance clarify --change <change-id>`。
11. Write/Edit/Guard 失败时立即读取一次状态并停止；不得重复同一写入，不得改用
    Bash、Node 或临时脚本绕过。把问题写入 `openspec/.letsgo/issues.md` 后报告阻塞。

## 输出

写入 `openspec/changes/<change-id>/proposal.md`，至少包含：

- 上下文
- 代码影响分析
- 头脑风暴方案
- 反向审查
- 为什么做
- 改变什么
- 影响范围
- 验收标准
- 未决问题

## 边界

- 规划文档使用简体中文。
- clarify 阶段不修改生产代码、测试代码、设计文档或任务清单。
- 未获得需求摘要和方案确认时不定稿。
- 不手动修改 `status.json`。
