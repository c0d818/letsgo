import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStatus } from "../../state/change.js";
import { ACTIVE_MARKER_RELATIVE } from "../../lib/guard.js";

export async function selectProject({ projectDir, changeId }) {
  if (!changeId) {
    throw new Error("缺少变更 ID");
  }

  const status = await readStatus(projectDir, changeId);
  const markerPath = path.join(projectDir, ACTIVE_MARKER_RELATIVE);
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        changeId,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );

  return {
    projectDir,
    changeId,
    status,
  };
}
