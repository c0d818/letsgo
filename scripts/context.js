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
  process.env.CODEAGENT3_PROJECT_DIR ||
  input.cwd ||
  input.working_directory ||
  input.workingDirectory ||
  process.cwd();
const isUserPrompt = typeof input.prompt === "string";
await reconcileRuntimeState({ projectDir });
const inputEvent = input.hook_event_name ?? input.hookEventName;
const hookEventName =
  inputEvent === "SessionStart" || inputEvent === "UserPromptSubmit"
    ? inputEvent
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
