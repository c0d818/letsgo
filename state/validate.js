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
    await requireTddEvidence(projectDir, changeId, errors);
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
    await requireTddEvidence(projectDir, changeId, errors);
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

async function requireTddEvidence(projectDir, changeId, errors) {
  try {
    const text = await readChangeText(projectDir, changeId, "tdd-evidence.md");
    errors.push(...validateTddEvidence(text));
  } catch {
    errors.push(`缺少 openspec/changes/${changeId}/tdd-evidence.md`);
  }
}

export function validateTddEvidence(text) {
  const mode = text.match(/^模式[：:]\s*(TDD|豁免)\s*$/im)?.[1];
  if (!mode) {
    return ["tdd-evidence.md 必须包含“模式：TDD”或“模式：豁免”"];
  }

  if (mode === "豁免") {
    return validateTddExemption(text);
  }

  const errors = [];
  const cyclePattern = /^##\s+Cycle\s+\d+[：:]\s*(\S.*)$/gim;
  const matches = [...text.matchAll(cyclePattern)];
  if (matches.length === 0) {
    return ["tdd-evidence.md 的 TDD 模式至少需要一个“## Cycle N：行为”记录"];
  }

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const cycle = text.slice(start, end);
    const label = `Cycle ${index + 1}`;
    const phaseIndexes = ["RED", "GREEN", "REFACTOR"].map((phase) =>
      new RegExp(`^###\\s+${phase}\\s*$`, "im").exec(cycle)?.index ?? -1
    );
    if (
      phaseIndexes.every((phaseIndex) => phaseIndex >= 0) &&
      !(phaseIndexes[0] < phaseIndexes[1] && phaseIndexes[1] < phaseIndexes[2])
    ) {
      errors.push(`${label} 阶段顺序必须是 RED -> GREEN -> REFACTOR`);
    }
    validateTddPhase(cycle, "RED", "失败", label, errors);
    validateTddPhase(cycle, "GREEN", "通过", label, errors);
    validateTddPhase(cycle, "REFACTOR", "通过", label, errors, true);
  }

  return errors;
}

function validateTddExemption(text) {
  const errors = [];
  const section = markdownSection(text, "豁免");
  if (!section) {
    return ["tdd-evidence.md 的豁免模式必须包含“## 豁免”"];
  }
  requireEvidenceField(section, /理由[：:][ \t]*\S[^\r\n]*/, "豁免缺少具体理由", errors);
  requireEvidenceField(section, /验证命令[：:][ \t]*\S[^\r\n]*/, "豁免缺少验证命令", errors);
  requireEvidenceField(section, /结果[：:][ \t]*(通过|pass)(?:[ \t]|$)/im, "豁免验证结果必须为通过", errors);
  return errors;
}

function validateTddPhase(cycle, phase, expectedResult, label, errors, requireRefactor = false) {
  const section = markdownSection(cycle, phase, 3);
  if (!section) {
    errors.push(`${label} 缺少 ${phase} 阶段`);
    return;
  }
  requireEvidenceField(
    section,
    /测试命令[：:][ \t]*\S[^\r\n]*/,
    `${label} ${phase} 缺少测试命令`,
    errors
  );
  requireEvidenceField(
    section,
    new RegExp(`结果[：:][ \\t]*${expectedResult}(?:[ \\t]|$)`, "im"),
    `${label} ${phase} 结果必须为${expectedResult}`,
    errors
  );
  if (requireRefactor) {
    requireEvidenceField(
      section,
      /(?:重构|变更)[：:][ \t]*\S[^\r\n]*/,
      `${label} REFACTOR 缺少重构说明（无重构时写“无”）`,
      errors
    );
  }
}

function markdownSection(text, heading, level = 2) {
  const marker = new RegExp(`^${"#".repeat(level)}\\s+${heading}\\s*$`, "im").exec(text);
  if (!marker) {
    return "";
  }
  const rest = text.slice(marker.index + marker[0].length);
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, "m").exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function requireEvidenceField(text, pattern, message, errors) {
  if (!pattern.test(text)) {
    errors.push(message);
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
