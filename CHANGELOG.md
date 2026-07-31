# Changelog

All notable changes to Stitches are recorded here.

The format follows Keep a Changelog-style sections, and versions follow
semantic versioning while the project is still pre-1.0.

## [0.1.0] - 2026-07-31

### Added

- Initial Stitches CLI scaffold with `init`, `update`, `enable`, `disable`, and
  `doctor` commands.
- Fast OpenCode launcher `ocss`.
- Stitches OpenCode config at `opencode.stitches.json`.
- Single-source slash command prompts in `commands/`.
- Single-source Stitches skills in `skills/`.
- Project install templates for `AGENTS.md`, `opencode.json`, and `openspec/`.
- Node test coverage for CLI install, toggle, doctor, and `ocss` launcher
  structure.

### Changed

- Consolidated duplicate command and skill sources into top-level `commands/`
  and `skills/`.
- `ocss` now points `OPENCODE_CONFIG_DIR` at the Stitches project root so
  OpenCode loads the single-source commands and skills.

### Known Issues

- OpenCode plugin behavior is still a minimal local marker plugin.
- SDD lifecycle is not yet fully enforced by a validator or runtime guard.
