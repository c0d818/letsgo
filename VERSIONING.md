# 版本管理

Stitches 使用语义化版本。

项目处于 1.0 之前时，次版本仍可能改变命令和文件契约。补丁版本在同一
次版本线内应保持兼容。

## 发布检查清单

1. 更新 `package.json` 的版本号。
2. 更新 `CHANGELOG.md`。
3. 把 `BUGS.md` 中已解决的问题移到已关闭区段或 GitHub Issues。
4. 运行 `npm test`。
5. 用带版本号的提交信息提交，例如：

```bash
git commit -m "chore: release v0.1.0"
```

6. 打标签：

```bash
git tag v0.1.0
```

7. 推送分支和标签：

```bash
git push origin main
git push origin v0.1.0
```
