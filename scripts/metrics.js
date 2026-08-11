#!/usr/bin/env node
import { activeChanges, resolveActiveChange } from "../lib/guard.js";
import { reconcileRuntimeState } from "../lib/runtime-state.js";
import { recordRunMetric } from "../lib/run-summary.js";

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
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const input = parseInput(await readStdin());
if (!input) {
  process.stdout.write("{}");
  process.exit(0);
}

const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  input.cwd ||
  input.working_directory ||
  process.cwd();
await reconcileRuntimeState({ projectDir });
const context = await resolveActiveChange(projectDir, await activeChanges(projectDir));
if (!context) {
  process.stdout.write("{}");
  process.exit(0);
}

const metricByEvent = {
  PermissionDenied: "autoDenials",
  PreCompact: "compactionAttempts",
  PostCompact: "compactions",
};
const metric = input.hook_event_name === "PermissionRequest"
  ? input.tool_name === "AskUserQuestion"
    ? "clarificationQuestions"
    : "permissionPrompts"
  : metricByEvent[input.hook_event_name];
if (metric) {
  await recordRunMetric({
    projectDir,
    sessionId: input.session_id ?? null,
    changeId: context.changeId,
    stage: context.state,
    metric,
    detail: {
      event: input.hook_event_name,
      trigger: input.trigger ?? null,
      tool: input.tool_name ?? null,
    },
  });
}

process.stdout.write("{}");
