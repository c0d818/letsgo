import { renameIfExists } from "../lib/paths.js";

export async function disableProject({ projectDir }) {
  const disabled = [];

  if (await renameIfExists(projectDir, ".opencode/commands", ".opencode/commands.off")) {
    disabled.push(".opencode/commands");
  }

  if (await renameIfExists(projectDir, ".opencode/skills", ".opencode/skills.off")) {
    disabled.push(".opencode/skills");
  }

  return { projectDir, disabled };
}
