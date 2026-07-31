# Versioning

Stitches uses semantic versioning.

While the project is pre-1.0, minor versions may still change command and file
contracts. Patch versions should remain compatible within the same minor line.

## Release Checklist

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Move resolved items from `BUGS.md` to the closed section or GitHub Issues.
4. Run `npm test`.
5. Commit with a versioned message, for example:

```bash
git commit -m "chore: release v0.1.0"
```

6. Tag the commit:

```bash
git tag v0.1.0
```

7. Push branch and tags:

```bash
git push origin main
git push origin v0.1.0
```
