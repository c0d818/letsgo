import {
  activeChanges,
  readActiveMarker,
} from "../../lib/guard.js";
import {
  REVIEWER,
  prepareRuntimeHandoff,
  readRuntimeState,
} from "../../lib/runtime-state.js";
import { STAGE_SKILLS, STAGE_WRITERS } from "../../lib/runtime-state.js";
import { readStatus } from "../../state/change.js";
import { selectProject } from "./select.js";

export async function continueProject({ projectDir, changeId = null }) {
  const active = await activeChanges(projectDir);
  const marker = await readActiveMarker(projectDir);
  const selected = changeId
    ? active.find((item) => item.id === changeId)
    : active.find((item) => item.id === marker) ?? (active.length === 1 ? active[0] : null);

  if (!selected) {
    return {
      projectDir,
      ok: false,
      needsSelection: active.length > 1,
      selected: null,
      active,
      errors: [
        active.length > 1
          ? "存在多个活跃变更，请选择要继续的 change-id"
          : changeId
            ? `找不到活跃变更：${changeId}`
            : "没有可继续的活跃变更",
      ],
    };
  }

  await selectProject({ projectDir, changeId: selected.id });
  const status = await readStatus(projectDir, selected.id);
  const runtime = await prepareRuntimeHandoff({
    projectDir,
    changeId: selected.id,
    stage: status.state,
  });
  const reviewer = runtime.agents?.[REVIEWER] ?? null;
  const requiredSkills = STAGE_SKILLS[status.state] ?? [];
  const missingSkills = requiredSkills.filter((skill) => runtime.skills?.[skill] !== "loaded");
  const writer = STAGE_WRITERS[status.state] ?? null;
  const writerCompleted = !writer || runtime.agents?.[writer]?.status === "completed";

  let resume;
  if (reviewer?.status === "passed") {
    resume = {
      action: "advance",
      stage: status.state,
      preservedReviewer: "passed",
      command: `letsgo advance ${status.state} --change ${selected.id}`,
    };
  } else if (reviewer?.status === "blocked" && Number(reviewer.attempts ?? 0) >= 2) {
    resume = {
      action: "blocked",
      stage: status.state,
      blocking: reviewer.result?.blocking ?? [],
      attempts: Number(reviewer.attempts ?? 0),
      next: `/lg:reopen ${selected.id} ${status.state} <针对阻塞项的修订理由>`,
    };
  } else if (missingSkills.length > 0) {
    resume = { action: "load-skill", stage: status.state, missingSkills };
  } else if (!writerCompleted) {
    resume = { action: "run-writer", stage: status.state, writer };
  } else {
    resume = {
      action: "run-reviewer",
      stage: status.state,
      reviewer: REVIEWER,
      attempts: Number(reviewer?.attempts ?? 0),
    };
  }

  return {
    projectDir,
    ok: true,
    selected: { changeId: selected.id, state: status.state, type: status.type },
    status,
    runtimePreserved: true,
    resume,
  };
}
