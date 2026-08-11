import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { STATES } from "../state/states.js";

export const RUN_SUMMARY_RELATIVE = path.posix.join(
  "openspec",
  ".letsgo",
  "run-summary.json"
);

const DEFAULT_METRICS = {
  permissionPrompts: 0,
  clarificationQuestions: 0,
  autoDenials: 0,
  compactionAttempts: 0,
  compactions: 0,
  guardDenials: 0,
  repeatedGuardDenials: 0,
  codeGraphQueries: 0,
};

export async function readRunSummary(projectDir) {
  try {
    const raw = await readFile(runSummaryPath(projectDir), "utf8");
    const summary = JSON.parse(raw);
    return summary && typeof summary === "object"
      ? { ...summary, metrics: { ...DEFAULT_METRICS, ...(summary.metrics ?? {}) } }
      : null;
  } catch {
    return null;
  }
}

export async function recordStageStarted({
  projectDir,
  sessionId,
  changeId,
  stage,
}) {
  if (!changeId || !stage) {
    return null;
  }
  const summary = await scopedSummary({ projectDir, sessionId, changeId, stage });
  const existing = summary.stages.find((item) => item.stage === stage);
  if (existing) {
    existing.status = existing.status === "completed" ? "completed" : "in_progress";
    existing.startedAt ??= new Date().toISOString();
  } else {
    summary.stages.push({
      stage,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      skills: {},
      agents: {},
    });
  }
  summary.currentStage = stage;
  summary.status = "in_progress";
  return writeRunSummary(projectDir, summary);
}

export async function recordStageCompleted({
  projectDir,
  sessionId,
  changeId,
  stage,
  runtimeState = {},
  nextStage,
}) {
  const summary = await scopedSummary({ projectDir, sessionId, changeId, stage });
  let entry = summary.stages.find((item) => item.stage === stage);
  if (!entry) {
    entry = {
      stage,
      status: "in_progress",
      startedAt: runtimeState.startedAt ?? new Date().toISOString(),
      completedAt: null,
      skills: {},
      agents: {},
    };
    summary.stages.push(entry);
  }
  entry.status = "completed";
  entry.completedAt = new Date().toISOString();
  entry.skills = { ...(runtimeState.skills ?? {}) };
  entry.agents = { ...(runtimeState.agents ?? {}) };
  summary.currentStage = nextStage === "done" ? null : nextStage;
  summary.status = nextStage === "done" ? "completed" : "in_progress";
  summary.completedAt = nextStage === "done" ? new Date().toISOString() : null;
  return writeRunSummary(projectDir, summary);
}

export async function recordStageReopened({
  projectDir,
  sessionId,
  changeId,
  fromStage,
  toStage,
  reason,
  runtimeState = {},
}) {
  const summary = await scopedSummary({
    projectDir,
    sessionId,
    changeId,
    stage: toStage,
  });
  const targetIndex = STATES.indexOf(toStage);
  const invalidatedStages = summary.stages.filter(
    (entry) => STATES.indexOf(entry.stage) >= targetIndex
  );
  const reopen = {
    at: new Date().toISOString(),
    fromStage,
    toStage,
    reason,
    runtime: structuredClone(runtimeState),
    invalidatedStages: structuredClone(invalidatedStages),
  };

  summary.reopens = [...(summary.reopens ?? []), reopen];
  summary.stages = summary.stages.filter(
    (entry) => STATES.indexOf(entry.stage) < targetIndex
  );
  summary.currentStage = toStage;
  summary.status = "in_progress";
  summary.completedAt = null;
  return writeRunSummary(projectDir, summary);
}

export async function recordRunMetric({
  projectDir,
  sessionId = null,
  changeId,
  stage = null,
  metric,
  detail = null,
}) {
  if (!changeId || !metric) {
    return null;
  }
  const summary = await scopedSummary({ projectDir, sessionId, changeId, stage });
  summary.metrics[metric] = Number(summary.metrics[metric] ?? 0) + 1;
  if (detail) {
    summary.lastMetric = {
      metric,
      detail,
      at: new Date().toISOString(),
    };
  }
  return writeRunSummary(projectDir, summary);
}

export async function recordGuardDenial({
  projectDir,
  sessionId = null,
  changeId,
  stage = null,
  fingerprint,
  reason,
}) {
  if (!changeId) {
    return { repeatCount: 1, summary: null };
  }
  const summary = await scopedSummary({ projectDir, sessionId, changeId, stage });
  summary.metrics.guardDenials = Number(summary.metrics.guardDenials ?? 0) + 1;
  const same = summary.lastGuardDenial?.fingerprint === fingerprint;
  const repeatCount = same ? Number(summary.lastGuardDenial.repeatCount ?? 1) + 1 : 1;
  if (same) {
    summary.metrics.repeatedGuardDenials =
      Number(summary.metrics.repeatedGuardDenials ?? 0) + 1;
  }
  summary.lastGuardDenial = {
    fingerprint,
    reason,
    repeatCount,
    at: new Date().toISOString(),
  };
  return {
    repeatCount,
    summary: await writeRunSummary(projectDir, summary),
  };
}

export async function buildRecoveryContext({ projectDir }) {
  const summary = await readRunSummary(projectDir);
  if (!summary?.changeId || summary.status === "completed") {
    return "";
  }
  const stages = summary.stages
    .map((item) => `${item.stage}:${item.status}`)
    .join(" -> ");
  return [
    `LetsGo 恢复摘要：${summary.changeId}`,
    `当前阶段：${summary.currentStage ?? "done"}`,
    `阶段记录：${stages || "无"}`,
    "恢复后先运行 `letsgo status --change <change-id>`，不要重复已完成阶段。",
  ].join("\n");
}

async function scopedSummary({ projectDir, sessionId, changeId, stage }) {
  const current = await readRunSummary(projectDir);
  const now = new Date().toISOString();
  if (!current || current.changeId !== changeId) {
    return {
      version: 1,
      changeId,
      sessionIds: sessionId ? [sessionId] : [],
      currentStage: stage,
      status: "in_progress",
      startedAt: now,
      completedAt: null,
      stages: [],
      metrics: { ...DEFAULT_METRICS },
      updatedAt: now,
    };
  }
  const sessionIds = new Set(current.sessionIds ?? []);
  if (sessionId) {
    sessionIds.add(sessionId);
  }
  return {
    ...current,
    sessionIds: [...sessionIds],
    stages: (current.stages ?? []).map((item) => ({ ...item })),
    metrics: { ...DEFAULT_METRICS, ...(current.metrics ?? {}) },
  };
}

async function writeRunSummary(projectDir, summary) {
  const filename = runSummaryPath(projectDir);
  await mkdir(path.dirname(filename), { recursive: true });
  const next = { ...summary, updatedAt: new Date().toISOString() };
  const temporary = `${filename}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, filename);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return next;
}

function runSummaryPath(projectDir) {
  return path.join(projectDir, RUN_SUMMARY_RELATIVE);
}
