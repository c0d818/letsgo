import { existsAt } from "../lib/paths.js";

export async function doctorProject({ projectDir }) {
  const agents = await existsAt(projectDir, "AGENTS.md");
  const commands = await existsAt(projectDir, ".opencode/commands");
  const skills = await existsAt(projectDir, ".opencode/skills");
  const openspec = await existsAt(projectDir, "openspec");

  return {
    projectDir,
    installed: agents && commands && skills && openspec,
    agents,
    commands,
    skills,
    openspec,
  };
}
