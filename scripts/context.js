#!/usr/bin/env node
import { buildActiveContext, buildSystemRules } from "../lib/guard.js";
import { reconcileRuntimeState } from "../lib/runtime-state.js";

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
    return {};
  }
}

const input = parseInput(await readStdin());
const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  input.cwd ||
  input.working_directory ||
  process.cwd();
const isUserPrompt = typeof input.prompt === "string";
await reconcileRuntimeState({ projectDir });
const hookEventName =
  input.hook_event_name === "SessionStart" ||
  input.hook_event_name === "UserPromptSubmit"
    ? input.hook_event_name
    : isUserPrompt
      ? "UserPromptSubmit"
      : "SessionStart";
const rules = isUserPrompt
  ? await buildActiveContext({ projectDir })
  : await buildSystemRules({ projectDir });

if (!rules) {
  process.stdout.write("{}");
} else {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: rules,
      },
    })
  );
}
