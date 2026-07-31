---
name: stitches-spec
description: Use when creating, applying, reviewing, or archiving OpenSpec-style changes through Stitches
---

# Stitches Spec

OpenSpec is the durable state layer. Stitches uses it to keep intent,
implementation, and verification aligned.

## Directory Contract

```text
openspec/
  project.md
  specs/
  changes/
    <change-id>/
      proposal.md
      tasks.md
      design.md
```

`design.md` is required when work crosses module boundaries.

Review spec compliance before reviewing code style.
