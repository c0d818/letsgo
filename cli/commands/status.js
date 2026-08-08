import { changeDir, readStatus } from "../../state/change.js";
import { NEXT_STATE, STATE_LABELS } from "../../state/states.js";

export async function statusProject({ projectDir, changeId }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }

  const status = await readStatus(projectDir, changeId);
  const nextState = NEXT_STATE[status.state] ?? null;

  return {
    projectDir,
    changeId,
    changeDir: changeDir(projectDir, changeId),
    status,
    current: {
      state: status.state,
      label: STATE_LABELS[status.state] ?? status.state,
    },
    next: nextState
      ? { state: nextState, label: STATE_LABELS[nextState] ?? nextState }
      : null,
    completed: status.completed.map((state) => ({
      state,
      label: STATE_LABELS[state] ?? state,
    })),
  };
}
