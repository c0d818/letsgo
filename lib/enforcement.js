export const ENFORCEMENT_MODES = ["advisory", "strict"];

export function enforcementMode(env = process.env) {
  return String(env.LETSGO_ENFORCEMENT ?? "advisory").toLowerCase() === "strict"
    ? "strict"
    : "advisory";
}

export function softenDenial(decision, env = process.env) {
  if (enforcementMode(env) !== "advisory" || decision?.status !== "deny") {
    return decision;
  }
  return {
    ...decision,
    status: "allow",
    advisory: true,
    originalStatus: "deny",
    reason: `LetsGo 宽松模式已放行；建议后续修正：${decision.reason}`,
  };
}
