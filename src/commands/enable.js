import { renameIfExists } from "../lib/paths.js";

export async function enableProject({ projectDir }) {
  const enabled = [];

  if (await renameIfExists(projectDir, ".opencode/commands.off", ".opencode/commands")) {
    enabled.push(".opencode/commands");
  }

  if (await renameIfExists(projectDir, ".opencode/skills.off", ".opencode/skills")) {
    enabled.push(".opencode/skills");
  }

  return { projectDir, enabled };
}
