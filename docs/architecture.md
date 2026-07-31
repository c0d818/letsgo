# Architecture

Stitches has three layers:

1. CLI: copies and toggles templates in target projects.
2. OpenCode commands: expose the workflow as slash commands.
3. OpenCode skills: define durable process rules for future agents.

The first version does not fork OpenSpec or Superpowers. It composes them by
installing project-local files.
