import { readStatus, writeStatus } from "../../state/change.js";
import { NEXT_STATE, assertState } from "../../state/states.js";
import {
  readRuntimeState,
  resetRuntimeState,
  validateRuntimeBeforeAdvance,
} from "../../lib/runtime-state.js";
import { recordStageCompleted } from "../../lib/run-summary.js";
import { validateProject } from "./validate.js";
import { clearActiveMarker } from "../../lib/guard.js";
import { enforcementMode } from "../../lib/enforcement.js";

export async function advanceProject({ projectDir, changeId, state }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }
  assertState(state);

  const status = await readStatus(projectDir, changeId);
  if (status.state !== state) {
    return {
      projectDir,
      changeId,
      state,
      ok: false,
      advanced: false,
      status,
      errors: [`无法推进 ${state}，因为当前状态是 ${status.state}`],
    };
  }

  const validation = await validateProject({ projectDir, changeId, mode: "after", state });
  if (!validation.ok) {
    return {
      ...validation,
      advanced: false,
    };
  }

  const runtimeValidation = await validateRuntimeBeforeAdvance({
    projectDir,
    changeId,
    stage: state,
  });
  const mode = enforcementMode();
  if (!runtimeValidation.ok && mode === "strict") {
    return {
      ...validation,
      ok: false,
      advanced: false,
      errors: runtimeValidation.errors,
    };
  }

  const completed = status.completed.includes(state)
    ? status.completed
    : [...status.completed, state];
  const approved = {
    ...status.approved,
    [state]: true,
  };
  const nextStatus = await writeStatus(projectDir, changeId, {
    ...status,
    state: NEXT_STATE[state],
    completed,
    approved,
  });
  const runtimeState = await readRuntimeState(projectDir);
  await recordStageCompleted({
    projectDir,
    sessionId: runtimeState?.sessionId ?? null,
    changeId,
    stage: state,
    runtimeState: runtimeState ?? {},
    nextStage: NEXT_STATE[state],
  });
  await resetRuntimeState({
    projectDir,
    sessionId: runtimeState?.sessionId ?? null,
    changeId: NEXT_STATE[state] === "done" ? null : changeId,
    stage: NEXT_STATE[state] === "done" ? null : NEXT_STATE[state],
  });
  if (NEXT_STATE[state] === "done") {
    await clearActiveMarker(projectDir);
  }

  return {
    projectDir,
    changeId,
    state,
    advanced: true,
    status: nextStatus,
    enforcementMode: mode,
    runtimeWarnings: runtimeValidation.ok ? [] : runtimeValidation.errors,
  };
}
