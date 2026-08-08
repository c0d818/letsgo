---
description: 记录运行问题
argument-hint: <问题描述>
---

# 记录运行问题

把运行中遇到的问题追加到 `openspec/.stitches/issues.md`（文件不存在就创建）。

## 步骤

1. 读取 `openspec/.stitches/issues.md`；不存在时按空文件处理。
2. 用 Write/Edit 工具把新问题**追加**到文件末尾，格式：

   ```text
   ## <日期 时间>
   - <问题描述>
   ```

3. 描述要具体：什么阶段、什么命令、什么现象、可能原因（如果知道）。
4. 完成后告诉用户“已记录到 `openspec/.stitches/issues.md`”。

只追加，不删除已有内容。
