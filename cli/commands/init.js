import { copyTemplateTree } from "../../lib/copy-template.js";
import { agentRoot, commandRoot, skillRoot, templateRoot } from "../../lib/paths.js";

export async function initProject({ projectDir, force = false }) {
  const templates = await copyTemplateTree({
    fromDir: templateRoot,
    toDir: projectDir,
    force,
  });

  const commands = await copyTemplateTree({
    fromDir: commandRoot,
    toDir: `${projectDir}/.claude/commands`,
    force,
  });

  const skills = await copyTemplateTree({
    fromDir: skillRoot,
    toDir: `${projectDir}/.claude/skills`,
    force,
  });

  const agents = await copyTemplateTree({
    fromDir: agentRoot,
    toDir: `${projectDir}/.claude/agents`,
    force,
  });

  return mergeResults(projectDir, [
    templates,
    prefixResult(commands, ".claude/commands"),
    prefixResult(skills, ".claude/skills"),
    prefixResult(agents, ".claude/agents"),
  ]);
}

function prefixResult(result, prefix) {
  return {
    ...result,
    created: result.created.map((entry) => `${prefix}/${entry}`),
    updated: result.updated.map((entry) => `${prefix}/${entry}`),
    skipped: result.skipped.map((entry) => `${prefix}/${entry}`),
  };
}

function mergeResults(projectDir, results) {
  return {
    projectDir,
    created: results.flatMap((result) => result.created),
    updated: results.flatMap((result) => result.updated),
    skipped: results.flatMap((result) => result.skipped),
  };
}
