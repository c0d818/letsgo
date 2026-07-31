# Bugs

Track known bugs, rough edges, and follow-up fixes here until GitHub Issues is
the primary tracker.

## Open

### BUG-0001: Empty legacy directories may remain after migration

- Status: Open
- Severity: Low
- Area: Repository cleanup
- First seen: 2026-07-31
- Symptom: `opencode/commands`, `opencode/skills`, or `templates/.opencode`
  can remain as empty directories after moving command and skill sources to
  top-level `commands/` and `skills/`.
- Workaround: Remove empty directories manually after confirming they contain
  no files.
- Desired fix: Add a cleanup command or migration script.

### BUG-0002: Runtime guard is not implemented yet

- Status: Open
- Severity: Medium
- Area: SDD enforcement
- First seen: 2026-07-31
- Symptom: Stitches documents the desired workflow but does not yet block
  skipped lifecycle states such as applying code before a plan exists.
- Workaround: Use `/stitch-*` commands and `stitches doctor` manually.
- Desired fix: Add `stitches validate` and then a stricter OpenCode runtime
  guard.

## Closed

No closed bugs yet.
