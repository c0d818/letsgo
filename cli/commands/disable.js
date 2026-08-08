import { renameIfExists } from "../../lib/paths.js";

export async function disableProject({ projectDir }) {
  const disabled = [];

  if (await renameIfExists(projectDir, ".claude/commands", ".claude/commands.off")) {
    disabled.push(".claude/commands");
  }

  if (await renameIfExists(projectDir, ".claude/skills", ".claude/skills.off")) {
    disabled.push(".claude/skills");
  }

  return { projectDir, disabled };
}
