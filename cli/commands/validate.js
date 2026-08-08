import { validateChange } from "../../state/validate.js";

export async function validateProject({ projectDir, changeId, mode = "before", state }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }
  if (!state) {
    throw new Error("缺少阶段");
  }

  return validateChange({ projectDir, changeId, mode, state });
}
