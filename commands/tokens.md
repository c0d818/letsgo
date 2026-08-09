---
description: 查看 token 用量
argument-hint: [transcript-path]
---

# 查看 Token 用量

统计当前项目最近一次会话（或指定 transcript）中主代理和每个 subagent 的
token 用量。

## 步骤

1. 运行 `stitches tokens`，自动查找当前项目最近一次的会话记录；自动查找失败
   时，运行 `stitches tokens <transcript 路径>`。
2. 把返回结果整理成表格展示给用户：
   - 主代理和每个 subagent 的输入、输出、缓存读取、缓存写入、总计
   - 全部合计
3. 报告已保存到 `openspec/.stitches/token-report.md`，把位置告诉用户。

只读命令，不修改任何业务文件。
