import { renameIfExists } from "../../lib/paths.js";

export async function enableProject({ projectDir }) {
  const enabled = [];

  if (await renameIfExists(projectDir, ".claude/commands.off", ".claude/commands")) {
    enabled.push(".claude/commands");
  }

  if (await renameIfExists(projectDir, ".claude/skills.off", ".claude/skills")) {
    enabled.push(".claude/skills");
  }

  return { projectDir, enabled };
}
