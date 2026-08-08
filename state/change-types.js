export const DEFAULT_CHANGE_TYPE = "feature";

export const CHANGE_TYPES = [
  "feature",
  "bugfix",
  "refactor",
  "test",
  "maintenance",
];

export function assertChangeType(type) {
  if (!CHANGE_TYPES.includes(type)) {
    throw new Error(`未知变更类型：${type}`);
  }
}
