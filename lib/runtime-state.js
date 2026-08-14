import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStatus } from "../state/change.js";
import { validateChange } from "../state/validate.js";
import { recordStageStarted } from "./run-summary.js";

export const RUNTIME_STATE_RELATIVE = path.posix.join(
  "openspec",
  ".letsgo",
  "runtime-state.json"
);

export const STAGE_SKILLS = {
  clarify: ["lg:letsgo-clarify"],
  design: ["lg:letsgo-design"],
  plan: ["lg:letsgo-plan"],
  apply: ["lg:letsgo-apply", "lg:letsgo-tdd"],
  verify: ["lg:letsgo-verify"],
  archive: ["lg:letsgo-archive"],
};

export const STAGE_WRITERS = {
  design: "lg:letsgo-design-writer",
  plan: "lg:letsgo-plan-writer",
  apply: "lg:letsgo-apply-writer",
  verify: "lg:letsgo-verify-writer",
  archive: "lg:letsgo-archive-writer",
};

export const REVIEWER = "lg:letsgo-reviewer";

const AGENT_ALIASES = new Map([
  ["lg:review", REVIEWER],
  ["review", REVIEWER],
]);

export async function readRuntimeState(projectDir) {
  try {
    const raw = await readFile(runtimeStatePath(projectDir), "utf8");
    const state = JSON.parse(raw);
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

export async function recordSkillCompleted({
  projectDir,
  sessionId,
  changeId,
  stage,
  skillName,
}) {
  const component = canonicalSkillName(skillName);
  if (!component) {
    return null;
  }

  const state = await scopedRuntimeState({ projectDir, sessionId, changeId, stage });
  state.skills[component] = "loaded";
  const next = await writeRuntimeState(projectDir, state);
  await recordStageStarted({ projectDir, sessionId, changeId, stage });
  return next;
}

export async function recordSkillFailed({
  projectDir,
  sessionId,
  changeId,
  stage,
  skillName,
}) {
  const component = canonicalSkillName(skillName);
  if (!component) {
    return null;
  }

  const state = await scopedRuntimeState({ projectDir, sessionId, changeId, stage });
  state.skills[component] = "failed";
  return writeRuntimeState(projectDir, state);
}

export async function recordAgentStarted({
  projectDir,
  sessionId,
  changeId,
  stage,
  agentType,
  agentId = null,
  agentTranscriptPath = null,
}) {
  const component = canonicalAgentName(agentType);
  if (!component) {
    return null;
  }

  const state = await scopedRuntimeState({ projectDir, sessionId, changeId, stage });
  const previous = state.agents[component] ?? {};
  if (component === STAGE_WRITERS[stage] && state.agents[REVIEWER]) {
    state.agents[REVIEWER] = {
      ...state.agents[REVIEWER],
      status: "stale",
    };
  }
  state.agents[component] = {
    status: "started",
    agentId,
    agentTranscriptPath,
    attempts: Number(previous.attempts ?? 0) + 1,
  };
  return writeRuntimeState(projectDir, state);
}

export async function reconcileStartedAgentsFromTranscripts({
  projectDir,
  sessionId,
  changeId,
  stage,
  transcriptPath = null,
}) {
  const state = await readRuntimeState(projectDir);
  if (
    !state ||
    state.sessionId !== sessionId ||
    state.changeId !== changeId ||
    state.stage !== stage
  ) {
    return state;
  }

  for (const [agentType, agent] of Object.entries(state.agents ?? {})) {
    if (agent?.status !== "started" || !agent.agentId) {
      continue;
    }
    const candidate =
      agent.agentTranscriptPath ??
      derivedAgentTranscriptPath(transcriptPath, agent.agentId);
    const lastAssistantMessage = await readLastAssistantMessage(candidate);
    if (!parseAgentResult(lastAssistantMessage)) {
      continue;
    }
    await recordAgentStopped({
      projectDir,
      sessionId,
      changeId,
      stage,
      agentType,
      agentId: agent.agentId,
      lastAssistantMessage,
    });
  }
  return readRuntimeState(projectDir);
}

export async function recordAgentStopped({
  projectDir,
  sessionId,
  changeId,
  stage,
  agentType,
  agentId = null,
  lastAssistantMessage = "",
}) {
  const component = canonicalAgentName(agentType);
  if (!component) {
    return null;
  }

  const state = await scopedRuntimeState({ projectDir, sessionId, changeId, stage });
  const previous = state.agents[component] ?? {};
  const result = parseAgentResult(lastAssistantMessage);
  let status = "invalid";
  let validationErrors = [];

  if (component === STAGE_WRITERS[stage] && state.agents[REVIEWER]) {
    state.agents[REVIEWER] = {
      ...state.agents[REVIEWER],
      status: "stale",
    };
  }

  if (
    result?.stage === stage &&
    result?.role === "writer" &&
    result?.status === "ready" &&
    validWriterResult(result) &&
    component === STAGE_WRITERS[stage]
  ) {
    status = "completed";
  }

  if (
    result?.stage === "apply" &&
    stage === "apply" &&
    result?.role === "writer" &&
    result?.status === "partial" &&
    component === STAGE_WRITERS.apply &&
    validPartialWriterResult(result)
  ) {
    status = "incomplete";
    validationErrors = result.remainingTasks.map((task) => `未完成任务：${task}`);
  }

  if (status === "completed" && stage === "apply") {
    const artifact = await validateChange({
      projectDir,
      changeId,
      mode: "after",
      state: stage,
    });
    if (!artifact.ok) {
      status = "incomplete";
      validationErrors = artifact.errors;
    }
  }

  if (
    result?.stage === stage &&
    result?.role === "reviewer" &&
    component === REVIEWER &&
    validReviewerResult(result) &&
    ["pass", "blocked"].includes(result?.status)
  ) {
    status = result.status === "pass" ? "passed" : "blocked";
  }

  state.agents[component] = {
    status,
    agentId,
    attempts: Number(previous.attempts ?? 0),
    result: result ?? null,
    validationErrors,
  };
  return writeRuntimeState(projectDir, state);
}

export async function decideAgentStart({
  projectDir,
  sessionId,
  changeId,
  stage,
  agentType,
  prompt = null,
  enforceNamespace = false,
}) {
  const component = canonicalAgentName(agentType);
  const expectedWriter = STAGE_WRITERS[stage];
  const allowedComponents = [expectedWriter, REVIEWER].filter(Boolean);
  const dispatchName = normalizeComponent(agentType);
  const state = await readRuntimeState(projectDir);

  if (
    state?.changeId &&
    state?.stage &&
    (state.changeId !== changeId || state.stage !== stage)
  ) {
    return deny(
      `LetsGo 状态冲突：continue runtime 为 ${state.changeId}/${state.stage}，` +
      `当前 active/status.json 为 ${changeId}/${stage}（项目根目录：${projectDir}）。` +
      `不要批准或重试 Agent；请执行 /lg:continue ${changeId} 重新绑定后，只执行返回的 resume 动作`
    );
  }

  if (
    enforceNamespace &&
    (!dispatchName || !allowedComponents.includes(dispatchName))
  ) {
    const received = String(agentType ?? "").trim() || "未提供 Agent 类型";
    return deny(
      `LetsGo ${stage} 阶段只能启动：${allowedComponents.join("、")}；收到 ${received}。` +
      `当前阶段的权威来源是 openspec/changes/${changeId}/status.json；` +
      "不得依据对话摘要、恢复前记忆或模型推断派发 general-purpose、随意命名或其他阶段的 Agent。" +
      `如刚运行 recover，请停止直接派发并执行 /lg:continue ${changeId}`
    );
  }

  if (!component) {
    return allow("非 LetsGo Subagent");
  }

  if (component !== expectedWriter && component !== REVIEWER) {
    return allow("当前阶段不管理此 LetsGo Subagent");
  }

  const promptError = validateAgentPrompt({ prompt, stage, component, expectedWriter });
  if (promptError) {
    return deny(promptError);
  }

  const scopeError = runtimeScopeError(state, { sessionId, changeId, stage });
  if (scopeError) {
    return deny(scopeError);
  }

  if (state.agents?.[component]?.status === "started") {
    return deny(`${component} 正在运行，不得重复启动；等待当前 Subagent 完成后再继续`);
  }

  if (component === REVIEWER) {
    const reviewer = state.agents?.[REVIEWER];
    if (reviewer?.status === "passed") {
      return deny(`${REVIEWER} 已通过，不得重复启动`);
    }
    if (Number(reviewer?.attempts ?? 0) >= 2) {
      return deny(`${REVIEWER} 每阶段最多启动 2 次（初审 + 一次复审）；请展示第二轮 blocking 并停止。不得手动批准产物；如需继续，须经用户授权 letsgo reopen 重开审查周期`);
    }
  }

  const missingSkills = STAGE_SKILLS[stage].filter(
    (skill) => state.skills?.[skill] !== "loaded"
  );
  if (missingSkills.length > 0) {
    return deny(`启动 ${component} 前必须先完成 Skill ${missingSkills.join("、")}`);
  }

  if (component === REVIEWER && expectedWriter) {
    const writer = state.agents?.[expectedWriter];
    if (writer?.status !== "completed") {
      const details = Array.isArray(writer?.validationErrors) && writer.validationErrors.length > 0
        ? `：${writer.validationErrors.join("；")}`
        : "";
      return deny(`启动 ${REVIEWER} 前必须先完成 ${expectedWriter}${details}`);
    }
  }

  if (component === REVIEWER && !expectedWriter) {
    const artifact = await validateChange({
      projectDir,
      changeId,
      mode: "after",
      state: stage,
    });
    if (!artifact.ok) {
      return deny(
        `启动 ${REVIEWER} 前必须先完成有效的 ${stage === "clarify" ? "proposal.md" : "阶段产物"}：${artifact.errors.join("；")}`
      );
    }
  }

  return allow(`运行前检查通过：允许启动 ${component}`);
}

export async function validateRuntimeBeforeAdvance({ projectDir, changeId, stage }) {
  const state = await readRuntimeState(projectDir);
  const errors = [];

  if (!state) {
    return {
      ok: false,
      errors: ["缺少 openspec/.letsgo/runtime-state.json 运行状态"],
    };
  }

  if (state.changeId !== changeId || state.stage !== stage) {
    errors.push(
      `运行状态不匹配：需要 ${changeId}/${stage}，当前是 ${state.changeId ?? "无"}/${state.stage ?? "无"}`
    );
    return { ok: false, errors };
  }

  for (const skill of STAGE_SKILLS[stage]) {
    if (state.skills?.[skill] !== "loaded") {
      errors.push(`阶段 Skill 尚未加载：${skill}`);
    }
  }

  const writer = STAGE_WRITERS[stage];
  if (writer && state.agents?.[writer]?.status !== "completed") {
    const details = state.agents?.[writer]?.validationErrors ?? [];
    errors.push(`阶段 writer 尚未完成：${writer}${details.length > 0 ? `：${details.join("；")}` : ""}`);
  }

  if (state.agents?.[REVIEWER]?.status !== "passed") {
    errors.push(`reviewer 尚未通过：${REVIEWER}`);
  }

  return { ok: errors.length === 0, errors };
}

export async function resetRuntimeState({
  projectDir,
  sessionId = null,
  changeId = null,
  stage = null,
}) {
  return writeRuntimeState(
    projectDir,
    emptyRuntimeState({ sessionId, changeId, stage })
  );
}

export async function prepareRuntimeHandoff({ projectDir, changeId, stage }) {
  const state = await readRuntimeState(projectDir);
  if (!state || state.changeId !== changeId || state.stage !== stage) {
    return resetRuntimeState({ projectDir, changeId, stage });
  }
  return writeRuntimeState(projectDir, {
    ...state,
    handoff: true,
    previousSessionId: state.sessionId ?? null,
    sessionId: null,
  });
}

export async function reconcileRuntimeState({ projectDir }) {
  const state = await readRuntimeState(projectDir);
  if (!state?.changeId || !state?.stage) {
    return state;
  }
  try {
    const status = await readStatus(projectDir, state.changeId);
    if (status.state === state.stage) {
      return state;
    }
  } catch {
    // 缺失的变更目录属于残留状态，下面原子重置 current runtime。
  }
  return resetRuntimeState({ projectDir });
}

export function skillNameFromToolInput(toolInput = {}) {
  for (const value of [
    toolInput.skill,
    toolInput.skill_name,
    toolInput.skillName,
    toolInput.name,
    toolInput.command,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim().split(/\s+/)[0];
    }
  }
  return null;
}

export function agentNameFromToolInput(toolInput = {}) {
  for (const value of [
    toolInput.subagent_type,
    toolInput.subagentType,
    toolInput.agent_type,
    toolInput.agentType,
    toolInput.name,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function parseAgentResult(text) {
  const lastLine = String(text ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  const raw = /^LETGO_RESULT\s+(\{.*\})\s*$/.exec(lastLine)?.[1];
  if (!raw) {
    return null;
  }
  try {
    const result = JSON.parse(raw);
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
}

function canonicalSkillName(value) {
  const name = normalizeComponent(value);
  if (!name || !name.includes("letsgo-")) {
    return null;
  }
  return name.includes(":") ? name : `lg:${name}`;
}

function canonicalAgentName(value) {
  const name = normalizeComponent(value);
  const alias = AGENT_ALIASES.get(name);
  if (alias) {
    return alias;
  }
  if (!name || !name.startsWith("letsgo-") && !name.includes(":letsgo-")) {
    return null;
  }
  return name.includes(":") ? name : `lg:${name}`;
}

function normalizeComponent(value) {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim().replace(/^[@/]+/, "") || null;
}

function validWriterResult(result) {
  return (
    Array.isArray(result.filesChanged) &&
    Array.isArray(result.evidence) &&
    result.evidence.length > 0 &&
    Array.isArray(result.risks)
  );
}

function validPartialWriterResult(result) {
  return (
    validWriterResult(result) &&
    Array.isArray(result.remainingTasks) &&
    result.remainingTasks.length > 0 &&
    result.remainingTasks.every((task) => typeof task === "string" && task.trim())
  );
}

function validReviewerResult(result) {
  return (
    Array.isArray(result.blocking) &&
    Array.isArray(result.evidence) &&
    result.evidence.length > 0 &&
    Array.isArray(result.risks)
  );
}

function validateAgentPrompt({ prompt, stage, component, expectedWriter }) {
  if (prompt === null || prompt === undefined) {
    return null;
  }
  const compact = String(prompt).replace(/\s+/g, "");
  if (/LETGO_RESULT:/.test(compact)) {
    return `启动 ${component} 前必须修正 LETGO_RESULT 协议：标记后不能有冒号`;
  }
  if (!/LETGO_RESULT\{/.test(compact)) {
    return null;
  }
  const role = component === REVIEWER ? "reviewer" : "writer";
  const prefix = `LETGO_RESULT{\"stage\":\"${stage}\",\"role\":\"${role}\"`;
  if (!compact.includes(prefix)) {
    return `启动 ${component} 前必须在 prompt 中写入当前阶段的完整 LETGO_RESULT 协议`;
  }
  const required = role === "reviewer"
    ? ['\"status\":\"pass\"', '\"status\":\"blocked\"', '\"blocking\"', '\"evidence\"', '\"risks\"']
    : ['\"filesChanged\"', '\"evidence\"', '\"risks\"'];
  const missing = required.filter((field) => !compact.includes(field));
  if (role === "writer") {
    const hasReady = compact.includes('\"status\":\"ready\"');
    const hasApplyPartial =
      stage === "apply" &&
      component === STAGE_WRITERS.apply &&
      compact.includes('\"status\":\"partial\"') &&
      compact.includes('\"remainingTasks\"');
    if (!hasReady && !hasApplyPartial) {
      missing.unshift(
        stage === "apply"
          ? '\"status\":\"ready\" 或完整的 \"status\":\"partial\"'
          : '\"status\":\"ready\"'
      );
    }
  }
  if (missing.length > 0) {
    return `启动 ${component} 前 LETGO_RESULT 协议缺少字段或状态：${missing.join("、")}`;
  }
  if (role === "writer" && component !== expectedWriter) {
    return `当前阶段 writer 必须是 ${expectedWriter}`;
  }
  return null;
}

function derivedAgentTranscriptPath(transcriptPath, agentId) {
  if (!transcriptPath || !agentId) {
    return null;
  }
  const sessionDirectory = path.join(
    path.dirname(transcriptPath),
    path.basename(transcriptPath, path.extname(transcriptPath))
  );
  return path.join(sessionDirectory, "subagents", `agent-${agentId}.jsonl`);
}

async function readLastAssistantMessage(filename) {
  if (!filename) {
    return "";
  }
  try {
    const lines = (await readFile(filename, "utf8")).trim().split(/\r?\n/).reverse();
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry?.message?.role !== "assistant") {
        continue;
      }
      const content = entry.message.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((item) => item?.type === "text" && typeof item.text === "string")
          .map((item) => item.text)
          .join("\n");
      }
    }
  } catch {
    return "";
  }
  return "";
}

async function scopedRuntimeState({ projectDir, sessionId, changeId, stage }) {
  const state = await readRuntimeState(projectDir);
  if (
    state?.handoff === true &&
    state.changeId === changeId &&
    state.stage === stage
  ) {
    return {
      ...state,
      sessionId,
      handoff: false,
      skills: { ...state.skills },
      agents: { ...state.agents },
    };
  }
  if (
    !state ||
    state.sessionId !== sessionId ||
    state.changeId !== changeId ||
    state.stage !== stage
  ) {
    return emptyRuntimeState({ sessionId, changeId, stage });
  }
  return {
    ...state,
    skills: { ...state.skills },
    agents: { ...state.agents },
  };
}

function runtimeScopeError(state, expected) {
  if (!state) {
    return "缺少运行状态；请先加载当前阶段 Skill";
  }
  if (state.sessionId !== expected.sessionId && state.handoff !== true) {
    return "当前 session 尚未加载阶段 Skill";
  }
  if (state.changeId !== expected.changeId || state.stage !== expected.stage) {
    return `运行状态与当前变更阶段不匹配；请加载 ${expected.changeId}/${expected.stage} 的阶段 Skill`;
  }
  return null;
}

function emptyRuntimeState({ sessionId, changeId, stage }) {
  return {
    version: 1,
    sessionId,
    changeId,
    stage,
    handoff: false,
    skills: {},
    agents: {},
    updatedAt: new Date().toISOString(),
  };
}

async function writeRuntimeState(projectDir, state) {
  const filename = runtimeStatePath(projectDir);
  await mkdir(path.dirname(filename), { recursive: true });
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(filename, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function runtimeStatePath(projectDir) {
  return path.join(projectDir, RUNTIME_STATE_RELATIVE);
}

function allow(reason) {
  return { status: "allow", reason };
}

function deny(reason) {
  return { status: "deny", reason };
}
