#!/usr/bin/env node
import {
  activeChanges,
  decideToolUse,
  isCodeGraphExploreTool,
  resolveActiveChange,
} from "../lib/guard.js";
import { reconcileRuntimeState } from "../lib/runtime-state.js";
import { recordGuardDenial, recordRunMetric } from "../lib/run-summary.js";

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
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "LetsGo guard could not read hook input",
      },
      message: "LetsGo guard could not read hook input",
    })
  );
} else {
  const projectDir = projectDirOf(input);
  await reconcileRuntimeState({ projectDir });
  const decision = await decideToolUse({
    projectDir,
    toolName: input.tool_name ?? input.toolName,
    toolInput: input.tool_input ?? input.toolInput ?? {},
  });
  const context = await resolveActiveChange(projectDir, await activeChanges(projectDir));
  if (
    decision.status === "allow" &&
    context &&
    isCodeGraphExploreTool(input.tool_name ?? input.toolName)
  ) {
    await recordRunMetric({
      projectDir,
      sessionId: input.session_id ?? null,
      changeId: context.changeId,
      stage: context.state,
      metric: "codeGraphQueries",
      detail: { tool: input.tool_name ?? input.toolName },
    });
  }
  if (decision.status === "deny") {
    if (context) {
      const toolInput = input.tool_input ?? input.toolInput ?? {};
      const fingerprint = JSON.stringify({
        tool: input.tool_name ?? input.toolName ?? "",
        command: toolInput.command ?? toolInput.cmd ?? "",
        path: toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path ?? "",
      });
      const tracked = await recordGuardDenial({
        projectDir,
        sessionId: input.session_id ?? null,
        changeId: context.changeId,
        stage: context.state,
        fingerprint,
        reason: decision.reason,
      });
      if (tracked.repeatCount > 1) {
        decision.reason = `${decision.reason}；同一操作已被阻止 ${tracked.repeatCount} 次，立即停止重试`;
      }
    }
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision.status,
        permissionDecisionReason: decision.reason,
      },
      message: decision.reason,
    })
  );
}
