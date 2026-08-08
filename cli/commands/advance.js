import { readStatus, writeStatus } from "../../state/change.js";
import { NEXT_STATE, assertState } from "../../state/states.js";
import { validateProject } from "./validate.js";

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

  return {
    projectDir,
    changeId,
    state,
    advanced: true,
    status: nextStatus,
  };
}
