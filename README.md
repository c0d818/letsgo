# Stitches

Stitches is a Franken-agent workflow pack for OpenCode. It stitches
Superpowers-style engineering discipline with OpenSpec-style lifecycle
management.

## Status

This repository is a first scaffold. It installs project-local OpenCode
commands, skills, and OpenSpec state folders.

## Usage

```bash
stitches init /path/to/project
stitches doctor /path/to/project
stitches disable /path/to/project
stitches enable /path/to/project
stitches update /path/to/project
```

## Project Tracking

- Version history: `CHANGELOG.md`
- Known bugs and follow-ups: `BUGS.md`
- Release process: `VERSIONING.md`
- GitHub issue templates: `.github/ISSUE_TEMPLATE/`

## Fast OpenCode Launcher

`ocss` starts OpenCode with the Stitches config, commands, skills, and plugin
loaded from this checkout:

```bash
ocss
```

If `ocss` is not on your PATH yet, add an alias:

```bash
alias ocss='/Users/gc0d/harness/stitches/bin/ocss'
```

The launcher sets:

```bash
OPENCODE_CONFIG=/Users/gc0d/harness/stitches/opencode.stitches.json
OPENCODE_CONFIG_DIR=/Users/gc0d/harness/stitches
```

After `init`, restart OpenCode in the target project and run:

```text
/stitch-explore
/stitch-propose
/stitch-apply
/stitch-review
/stitch-ship
```

## Boundaries

- Superpowers remains an upstream plugin or local fork.
- OpenSpec remains a CLI and project state format.
- Stitches owns the glue: project templates, command prompts, skill rules, and
  enable/disable/update lifecycle.
