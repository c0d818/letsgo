export const STATES = ["clarify", "design", "plan", "apply", "verify", "archive"];

export const STATE_LABELS = {
  clarify: "需求澄清",
  design: "技术设计",
  plan: "任务规划",
  apply: "实现变更",
  verify: "验证审查",
  archive: "归档沉淀",
  done: "已完成",
};

export const NEXT_STATE = {
  clarify: "design",
  design: "plan",
  plan: "apply",
  apply: "verify",
  verify: "archive",
  archive: "done",
};

export const STATE_FILES = {
  clarify: "proposal.md",
  design: "design.md",
  plan: "tasks.md",
  apply: "tasks.md",
  verify: "verification.md",
  archive: "archive.md",
};

export function assertState(state) {
  if (!STATES.includes(state)) {
    throw new Error(`未知阶段：${state}`);
  }
}

export function initialStatus(changeId, type, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    id: changeId,
    type,
    state: "clarify",
    completed: [],
    approved: Object.fromEntries(STATES.map((state) => [state, false])),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
