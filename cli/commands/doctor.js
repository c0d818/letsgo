import { execFile } from "node:child_process";
import { existsAt } from "../../lib/paths.js";

export async function doctorProject({
  projectDir,
  checkCodegraph = hasCodegraphExecutable,
}) {
  const [agents, commands, skills, openspec, codegraphIndexed, codegraphExecutable] =
    await Promise.all([
      existsAt(projectDir, "CLAUDE.md"),
      existsAt(projectDir, ".claude/commands"),
      existsAt(projectDir, ".claude/skills"),
      existsAt(projectDir, "openspec/change-types"),
      existsAt(projectDir, ".codegraph/codegraph.db"),
      checkCodegraph(),
    ]);

  return {
    projectDir,
    installed: agents && commands && skills && openspec,
    agents,
    commands,
    skills,
    openspec,
    codegraphExecutable,
    codegraphIndexed,
    codegraphReady: codegraphExecutable && codegraphIndexed,
  };
}

function hasCodegraphExecutable() {
  return new Promise((resolve) => {
    execFile("codegraph", ["version"], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}
