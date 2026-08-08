import { createChange, changeDir } from "../../state/change.js";

export async function newChangeProject({ projectDir, changeId, type }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }

  const status = await createChange(projectDir, changeId, type);
  return {
    projectDir,
    changeId,
    type: status.type,
    changeDir: changeDir(projectDir, changeId),
    status,
  };
}
