import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REVIEWER,
  RUNTIME_STATE_RELATIVE,
  decideAgentStart,
  parseAgentResult,
  readRuntimeState,
  recordAgentStarted,
  recordAgentStopped,
  recordSkillCompleted,
  resetRuntimeState,
  validateRuntimeBeforeAdvance,
} from "../lib/runtime-state.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-runtime-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("运行前检查按 Skill、writer、reviewer 顺序放行", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "add-login",
      stage: "design",
    };

    const beforeSkill = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-design-writer",
    });
    assert.equal(beforeSkill.status, "deny");
    assert.match(beforeSkill.reason, /Skill/);

    await recordSkillCompleted({ ...common, skillName: "letsgo-design" });
    assert.equal(
      (await decideAgentStart({ ...common, agentType: "letsgo-design-writer" })).status,
      "allow"
    );

    const earlyReviewer = await decideAgentStart({ ...common, agentType: REVIEWER });
    assert.equal(earlyReviewer.status, "deny");
    assert.match(earlyReviewer.reason, /design-writer/);

    await recordAgentStarted({
      ...common,
      agentType: "lg:letsgo-design-writer",
      agentId: "writer-1",
    });
    await recordAgentStopped({
      ...common,
      agentType: "lg:letsgo-design-writer",
      agentId: "writer-1",
      lastAssistantMessage:
        '完成\nLETGO_RESULT {"stage":"design","role":"writer","status":"ready"}',
    });
    assert.equal(
      (await decideAgentStart({ ...common, agentType: REVIEWER })).status,
      "allow"
    );

    await recordAgentStopped({
      ...common,
      agentType: REVIEWER,
      agentId: "reviewer-1",
      lastAssistantMessage:
        '通过\nLETGO_RESULT {"stage":"design","role":"reviewer","status":"pass","blocking":[]}',
    });
    assert.deepEqual(
      await validateRuntimeBeforeAdvance({
        projectDir,
        changeId: "add-login",
        stage: "design",
      }),
      { ok: true, errors: [] }
    );

    await recordAgentStarted({
      ...common,
      agentType: "lg:letsgo-design-writer",
      agentId: "writer-2",
    });
    assert.match(
      (await validateRuntimeBeforeAdvance({
        projectDir,
        changeId: "add-login",
        stage: "design",
      })).errors.join("\n"),
      /writer|reviewer/
    );
    assert.equal(
      (await readRuntimeState(projectDir)).agents[REVIEWER].status,
      "stale"
    );
  });
});

test("运行状态拒绝跨 session 复用并拒绝无效结果标记", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "add-login",
      stage: "apply",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-apply" });

    const otherSession = await decideAgentStart({
      ...common,
      sessionId: "session-2",
      agentType: "lg:letsgo-apply-writer",
    });
    assert.equal(otherSession.status, "deny");
    assert.match(otherSession.reason, /session/);

    await recordAgentStopped({
      ...common,
      agentType: "lg:letsgo-apply-writer",
      lastAssistantMessage: "实现完成，但没有结构化结果",
    });
    const state = await readRuntimeState(projectDir);
    assert.equal(state.agents["lg:letsgo-apply-writer"].status, "invalid");
    assert.match(
      (await validateRuntimeBeforeAdvance({
        projectDir,
        changeId: "add-login",
        stage: "apply",
      })).errors.join("\n"),
      /writer/
    );
  });
});

test("apply writer 同时要求 apply 和 TDD Skill", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "fix-login",
      stage: "apply",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-apply" });

    const missingTdd = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-apply-writer",
    });
    assert.equal(missingTdd.status, "deny");
    assert.match(missingTdd.reason, /letsgo-tdd/);

    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-tdd" });
    assert.equal(
      (await decideAgentStart({
        ...common,
        agentType: "lg:letsgo-apply-writer",
      })).status,
      "allow"
    );
  });
});

test("运行状态始终只覆盖一个 JSON 文件", async () => {
  await withTempDir(async (projectDir) => {
    await resetRuntimeState({
      projectDir,
      sessionId: "session-1",
      changeId: "add-login",
      stage: "clarify",
    });
    await recordSkillCompleted({
      projectDir,
      sessionId: "session-1",
      changeId: "add-login",
      stage: "clarify",
      skillName: "lg:letsgo-clarify",
    });

    const raw = await readFile(path.join(projectDir, RUNTIME_STATE_RELATIVE), "utf8");
    assert.equal(JSON.parse(raw).skills["lg:letsgo-clarify"], "completed");
  });
});

test("解析 Subagent 最后一行的 LETGO_RESULT", () => {
  assert.deepEqual(
    parseAgentResult(
      '摘要\nLETGO_RESULT {"stage":"verify","role":"reviewer","status":"blocked","blocking":["缺少测试"]}'
    ),
    {
      stage: "verify",
      role: "reviewer",
      status: "blocked",
      blocking: ["缺少测试"],
    }
  );
  assert.equal(parseAgentResult("没有标记"), null);
  assert.equal(
    parseAgentResult(
      'LETGO_RESULT {"stage":"verify","role":"reviewer","status":"pass","blocking":[]}\n标记后仍有文本'
    ),
    null
  );
});
