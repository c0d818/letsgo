#!/usr/bin/env node
import { activeChanges, resolveActiveChange } from "../lib/guard.js";
import {
  agentNameFromToolInput,
  decideAgentStart,
  recordAgentStarted,
  recordAgentStopped,
  recordSkillCompleted,
  recordSkillFailed,
  reconcileRuntimeState,
  skillNameFromToolInput,
} from "../lib/runtime-state.js";

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

function projectDirOf(input) {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    input?.cwd ||
    input?.working_directory ||
    process.cwd()
  );
}

function preToolOutput(status, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: status,
      permissionDecisionReason: reason,
    },
    message: reason,
  };
}

const input = parseInput(await readStdin());
const event = input?.hook_event_name;

if (!input) {
  process.stdout.write(
    JSON.stringify(preToolOutput("ask", "LetsGo 无法读取运行前检查输入"))
  );
  process.exit(0);
}

const projectDir = projectDirOf(input);
await reconcileRuntimeState({ projectDir });
const context = await resolveActiveChange(projectDir, await activeChanges(projectDir));

if (!context) {
  process.stdout.write(
    event === "PreToolUse"
      ? JSON.stringify(preToolOutput("allow", "没有活跃的 LetsGo 变更"))
      : "{}"
  );
  process.exit(0);
}

const common = {
  projectDir,
  sessionId: input.session_id ?? null,
  changeId: context.changeId,
  stage: context.state,
};

try {
  if (event === "PreToolUse" && input.tool_name === "Agent") {
    const decision = await decideAgentStart({
      ...common,
      agentType: agentNameFromToolInput(input.tool_input),
      prompt: input.tool_input?.prompt ?? null,
      enforceNamespace: true,
    });
    process.stdout.write(JSON.stringify(preToolOutput(decision.status, decision.reason)));
  } else if (event === "PostToolUse" && input.tool_name === "Skill") {
    await recordSkillCompleted({
      ...common,
      skillName: skillNameFromToolInput(input.tool_input),
    });
    process.stdout.write("{}");
  } else if (event === "PostToolUseFailure" && input.tool_name === "Skill") {
    await recordSkillFailed({
      ...common,
      skillName: skillNameFromToolInput(input.tool_input),
    });
    process.stdout.write("{}");
  } else if (event === "SubagentStart") {
    await recordAgentStarted({
      ...common,
      agentType: input.agent_type,
      agentId: input.agent_id ?? null,
    });
    process.stdout.write("{}");
  } else if (event === "SubagentStop") {
    await recordAgentStopped({
      ...common,
      agentType: input.agent_type,
      agentId: input.agent_id ?? null,
      lastAssistantMessage: input.last_assistant_message ?? "",
    });
    process.stdout.write("{}");
  } else {
    process.stdout.write("{}");
  }
} catch (error) {
  if (event === "PreToolUse") {
    process.stdout.write(
      JSON.stringify(
        preToolOutput(
          "ask",
          `LetsGo 运行前检查失败：${error instanceof Error ? error.message : "未知错误"}`
        )
      )
    );
  } else {
    process.stdout.write("{}");
  }
}
