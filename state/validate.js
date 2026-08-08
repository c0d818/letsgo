import { access } from "node:fs/promises";
import { changeFile, readChangeText, readStatus } from "./change.js";
import { NEXT_STATE, STATE_FILES, assertState } from "./states.js";

const REQUIRED_BEFORE = {
  clarify: [],
  design: ["clarify"],
  plan: ["clarify", "design"],
  apply: ["clarify", "design", "plan"],
  verify: ["clarify", "design", "plan", "apply"],
  archive: ["clarify", "design", "plan", "apply", "verify"],
};

export async function validateChange({ projectDir, changeId, mode, state }) {
  assertState(state);
  const errors = [];
  const status = await tryReadStatus(projectDir, changeId, errors);

  if (!status) {
    return result({ projectDir, changeId, mode, state, errors });
  }

  if (mode === "before") {
    await validateBefore({ projectDir, changeId, state, status, errors });
  } else if (mode === "after") {
    await validateAfter({ projectDir, changeId, state, status, errors });
  } else {
    errors.push(`未知校验模式：${mode}`);
  }

  return result({ projectDir, changeId, mode, state, status, errors });
}

async function tryReadStatus(projectDir, changeId, errors) {
  try {
    return await readStatus(projectDir, changeId);
  } catch {
    errors.push(`缺少 openspec/changes/${changeId}/status.json`);
    return null;
  }
}

async function validateBefore({ projectDir, changeId, state, status, errors }) {
  for (const prior of REQUIRED_BEFORE[state]) {
    if (!status.completed.includes(prior)) {
      errors.push(`${prior} 尚未完成`);
    }
    if (status.approved[prior] !== true) {
      errors.push(`${prior} 尚未批准`);
    }
    await requireFile(projectDir, changeId, STATE_FILES[prior], errors);
  }

  if (state === "verify") {
    await requireTasksComplete(projectDir, changeId, errors);
  }

  if (state === "archive") {
    await requireVerificationPassed(projectDir, changeId, errors);
  }
}

async function validateAfter({ projectDir, changeId, state, status, errors }) {
  await validateBefore({ projectDir, changeId, state, status, errors });
  await requireFile(projectDir, changeId, STATE_FILES[state], errors);

  if (state === "clarify") {
    await requireContains(projectDir, changeId, "proposal.md", [/why|为什么做/i, /what changes|改变什么/i, /acceptance criteria|验收标准/i], errors);
  }

  if (state === "design") {
    await requireContains(projectDir, changeId, "design.md", [/architecture|架构/i, /test strategy|测试策略/i], errors);
  }

  if (state === "plan") {
    await requireContains(projectDir, changeId, "tasks.md", [/- \[[ xX]\]/], errors);
  }

  if (state === "apply") {
    await requireTasksComplete(projectDir, changeId, errors);
  }

  if (state === "verify") {
    await requireVerificationPassed(projectDir, changeId, errors);
  }
}

async function requireFile(projectDir, changeId, filename, errors) {
  try {
    await access(changeFile(projectDir, changeId, filename));
    const text = await readChangeText(projectDir, changeId, filename);
    if (text.trim().length === 0) {
      errors.push(`${filename} is empty`);
    }
    if (/\b(TODO|TBD|REQUIRED)\b|待填写/i.test(text)) {
      errors.push(`${filename} 仍包含待填写/TODO/TBD/REQUIRED 占位内容`);
    }
  } catch {
    errors.push(`缺少 openspec/changes/${changeId}/${filename}`);
  }
}

async function requireContains(projectDir, changeId, filename, patterns, errors) {
  try {
    const text = await readChangeText(projectDir, changeId, filename);
    for (const pattern of patterns) {
      if (!pattern.test(text)) {
        errors.push(`${filename} 缺少匹配 ${pattern} 的必需内容`);
      }
    }
  } catch {
    // requireFile already reports this.
  }
}

async function requireTasksComplete(projectDir, changeId, errors) {
  try {
    const text = await readChangeText(projectDir, changeId, "tasks.md");
    if (/- \[ \]/.test(text)) {
      errors.push("tasks.md 中还有未完成的任务");
    }
  } catch {
    errors.push(`缺少 openspec/changes/${changeId}/tasks.md`);
  }
}

async function requireVerificationPassed(projectDir, changeId, errors) {
  try {
    const text = await readChangeText(projectDir, changeId, "verification.md");
    if (!/status:\s*pass|状态：\s*通过/i.test(text)) {
      errors.push("verification.md 必须包含“状态：通过”（或 Status: Pass）");
    }
  } catch {
    errors.push(`缺少 openspec/changes/${changeId}/verification.md`);
  }
}

function result({ projectDir, changeId, mode, state, status = null, errors }) {
  return {
    projectDir,
    changeId,
    mode,
    state,
    ok: errors.length === 0,
    status,
    nextState: errors.length === 0 && mode === "after" ? NEXT_STATE[state] : null,
    errors,
  };
}
