import { readStatus, writeStatus } from "../../state/change.js";
import { STATES, assertState } from "../../state/states.js";
import { readRuntimeState, resetRuntimeState } from "../../lib/runtime-state.js";
import { recordStageReopened } from "../../lib/run-summary.js";
import { selectProject } from "./select.js";

export async function reopenProject({ projectDir, changeId, state, reason }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }
  if (!state) {
    throw new Error("缺少要重新打开的阶段");
  }
  assertState(state);

  const resolution = String(reason ?? "").trim();
  if (!resolution) {
    throw new Error("缺少人工解除理由；请使用 --reason 记录 reviewer 阻塞项和用户决定");
  }

  const status = await readStatus(projectDir, changeId);
  const currentIndex = status.state === "done"
    ? STATES.length
    : STATES.indexOf(status.state);
  const targetIndex = STATES.indexOf(state);
  const errors = [];

  if (targetIndex >= currentIndex) {
    errors.push(`只能回到更早阶段：当前是 ${status.state}，目标是 ${state}`);
  }
  if (!status.completed.includes(state)) {
    errors.push(`只能重新打开已完成阶段：${state} 尚未完成`);
  }
  if (errors.length > 0) {
    return {
      projectDir,
      changeId,
      ok: false,
      reopened: false,
      fromState: status.state,
      state,
      status,
      errors,
    };
  }

  const runtimeState = await readRuntimeState(projectDir);
  const at = new Date().toISOString();
  const reviewer = runtimeState?.changeId === changeId
    ? runtimeState.agents?.["lg:letsgo-reviewer"] ?? null
    : null;
  const reopenAudit = {
    at,
    fromStage: status.state,
    toStage: state,
    reason: resolution,
    reviewer: reviewer ? structuredClone(reviewer) : null,
  };
  const completed = status.completed.filter(
    (completedStage) => STATES.indexOf(completedStage) < targetIndex
  );
  const approved = Object.fromEntries(
    STATES.map((stage) => [
      stage,
      STATES.indexOf(stage) < targetIndex ? Boolean(status.approved?.[stage]) : false,
    ])
  );
  const nextStatus = await writeStatus(projectDir, changeId, {
    ...status,
    state,
    completed,
    approved,
    reopens: [...(status.reopens ?? []), reopenAudit],
  });

  await recordStageReopened({
    projectDir,
    sessionId: runtimeState?.sessionId ?? null,
    changeId,
    fromStage: status.state,
    toStage: state,
    reason: resolution,
    runtimeState: runtimeState?.changeId === changeId ? runtimeState : {},
  });
  await resetRuntimeState({ projectDir, changeId, stage: state });
  await selectProject({ projectDir, changeId });

  return {
    projectDir,
    changeId,
    ok: true,
    reopened: true,
    fromState: status.state,
    state,
    reason: resolution,
    status: nextStatus,
  };
}
