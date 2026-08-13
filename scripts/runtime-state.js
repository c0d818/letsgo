#!/usr/bin/env node
import { activeChanges, resolveActiveChange } from "../lib/guard.js";
import {
  agentNameFromToolInput,
  decideAgentStart,
  parseAgentResult,
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
    process.env.CODEAGENT3_PROJECT_DIR ||
    input?.cwd ||
    input?.working_directory ||
    input?.workingDirectory ||
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

function textFromAgentResponse(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(textFromAgentResponse).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  if (typeof value.text === "string") {
    return value.text;
  }
  for (const key of ["content", "message", "result", "output", "response"]) {
    const text = textFromAgentResponse(value[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

const input = parseInput(await readStdin());
const event = input?.hook_event_name ?? input?.hookEventName;

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
  sessionId: input.session_id ?? input.sessionId ?? null,
  changeId: context.changeId,
  stage: context.state,
};
const toolName = input.tool_name ?? input.toolName;
const toolInput = input.tool_input ?? input.toolInput ?? {};

try {
  if (event === "PreToolUse" && toolName === "Agent") {
    const decision = await decideAgentStart({
      ...common,
      agentType: agentNameFromToolInput(toolInput),
      prompt: toolInput?.prompt ?? null,
      enforceNamespace: true,
    });
    process.stdout.write(JSON.stringify(preToolOutput(decision.status, decision.reason)));
  } else if (event === "PostToolUse" && toolName === "Skill") {
    await recordSkillCompleted({
      ...common,
      skillName: skillNameFromToolInput(toolInput),
    });
    process.stdout.write("{}");
  } else if (event === "PostToolUseFailure" && toolName === "Skill") {
    await recordSkillFailed({
      ...common,
      skillName: skillNameFromToolInput(toolInput),
    });
    process.stdout.write("{}");
  } else if (event === "PostToolUse" && toolName === "Agent") {
    const toolResponse = input.tool_response ?? input.toolResponse ?? {};
    const lastAssistantMessage = textFromAgentResponse(toolResponse);
    if (parseAgentResult(lastAssistantMessage)) {
      await recordAgentStopped({
        ...common,
        agentType: agentNameFromToolInput(toolInput),
        agentId:
          toolResponse.agent_id ??
          toolResponse.agentId ??
          input.agent_id ??
          input.agentId ??
          null,
        lastAssistantMessage,
      });
    }
    process.stdout.write("{}");
  } else if (event === "SubagentStart") {
    await recordAgentStarted({
      ...common,
      agentType: input.agent_type ?? input.agentType,
      agentId: input.agent_id ?? input.agentId ?? null,
    });
    process.stdout.write("{}");
  } else if (event === "SubagentStop") {
    await recordAgentStopped({
      ...common,
      agentType: input.agent_type ?? input.agentType,
      agentId: input.agent_id ?? input.agentId ?? null,
      lastAssistantMessage: input.last_assistant_message ?? input.lastAssistantMessage ?? "",
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
