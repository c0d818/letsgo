import assert from "node:assert/strict";
import test from "node:test";
import {
  enforcementMode,
  softenDenial,
} from "../lib/enforcement.js";

test("默认使用 advisory，strict 可显式恢复硬门禁", () => {
  assert.equal(enforcementMode({}), "advisory");
  assert.equal(enforcementMode({ LETSGO_ENFORCEMENT: "strict" }), "strict");
  assert.equal(enforcementMode({ LETSGO_ENFORCEMENT: "unknown" }), "advisory");
});

test("advisory 把 deny 转成带原始原因的 allow，strict 保持 deny", () => {
  const denied = { status: "deny", reason: "阶段不匹配" };
  assert.deepEqual(softenDenial(denied, { LETSGO_ENFORCEMENT: "strict" }), denied);
  const advisory = softenDenial(denied, {});
  assert.equal(advisory.status, "allow");
  assert.equal(advisory.originalStatus, "deny");
  assert.match(advisory.reason, /宽松模式已放行/);
  assert.match(advisory.reason, /阶段不匹配/);
});
