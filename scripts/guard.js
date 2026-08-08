#!/usr/bin/env node
import { decideToolUse } from "../guard.js";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseInput(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

function projectDirOf(input) {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    input?.cwd ||
    input?.working_directory ||
    process.cwd()
  );
}

const input = parseInput(await readStdin());
if (input === null) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: "ask",
        permissionDecisionReason: "Stitches guard could not read hook input",
      },
      message: "Stitches guard could not read hook input",
    })
  );
} else {
  const decision = await decideToolUse({
    projectDir: projectDirOf(input),
    toolName: input.tool_name ?? input.toolName,
    toolInput: input.tool_input ?? input.toolInput ?? {},
  });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: decision.status,
        permissionDecisionReason: decision.reason,
      },
      message: decision.reason,
    })
  );
}
