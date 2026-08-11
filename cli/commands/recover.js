import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ACTIVE_MARKER_RELATIVE,
  activeChanges,
  readActiveMarker,
} from "../../lib/guard.js";
import { resetRuntimeState } from "../../lib/runtime-state.js";

export async function recoverProject({ projectDir }) {
  const active = await activeChanges(projectDir);
  const marker = await readActiveMarker(projectDir);
  const marked = marker ? active.find((item) => item.id === marker) : null;
  const selected = marked ?? (active.length === 1 ? active[0] : null);

  if (!selected && active.length > 1) {
    await resetRuntimeState({ projectDir });
    return {
      projectDir,
      ok: false,
      selected: null,
      active,
      errors: ["存在多个活跃变更，请先运行 letsgo select <change-id>"],
    };
  }

  const markerPath = path.join(projectDir, ACTIVE_MARKER_RELATIVE);
  if (selected) {
    await mkdir(path.dirname(markerPath), { recursive: true });
    await writeFile(
      markerPath,
      `${JSON.stringify({ changeId: selected.id, updatedAt: new Date().toISOString() }, null, 2)}\n`
    );
  } else {
    await unlink(markerPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }

  await resetRuntimeState({
    projectDir,
    changeId: selected?.id ?? null,
    stage: selected?.state ?? null,
  });
  return {
    projectDir,
    ok: true,
    selected: selected
      ? { changeId: selected.id, state: selected.state, type: selected.type }
      : null,
    active,
    repaired: true,
  };
}
