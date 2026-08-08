import { existsAt } from "../../lib/paths.js";

export async function doctorProject({ projectDir }) {
  const agents = await existsAt(projectDir, "CLAUDE.md");
  const commands = await existsAt(projectDir, ".claude/commands");
  const skills = await existsAt(projectDir, ".claude/skills");
  const openspec = await existsAt(projectDir, "openspec/change-types");

  return {
    projectDir,
    installed: agents && commands && skills && openspec,
    agents,
    commands,
    skills,
    openspec,
  };
}
