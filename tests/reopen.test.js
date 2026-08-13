import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";
import { reopenProject } from "../cli/commands/reopen.js";
import { selectProject } from "../cli/commands/select.js";
import { readStatus, writeStatus } from "../state/change.js";
import { STATES } from "../state/states.js";
import { readActiveMarker } from "../lib/guard.js";
import {
  readRuntimeState,
  recordAgentStarted,
  recordAgentStopped,
  recordSkillCompleted,
  resetRuntimeState,
} from "../lib/runtime-state.js";
import {
  readRunSummary,
  recordStageCompleted,
  recordStageStarted,
} from "../lib/run-summary.js";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");

async function withTempProject(fn) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "letsgo-reopen-test-"));
  try {
    await fn(projectDir);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function prepareBlockedVerify(projectDir) {
  await initProject({ projectDir });
  await newChangeProject({ projectDir, changeId: "regenerate-last-reply" });
  const status = await readStatus(projectDir, "regenerate-last-reply");
  await writeStatus(projectDir, "regenerate-last-reply", {
    ...status,
    state: "verify",
    completed: ["clarify", "design", "plan", "apply"],
    approved: Object.fromEntries(
      STATES.map((stage) => [stage, ["clarify", "design", "plan", "apply"].includes(stage)])
    ),
  });
  await selectProject({ projectDir, changeId: "regenerate-last-reply" });

  await recordStageStarted({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "apply",
  });
  await recordStageCompleted({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "apply",
    runtimeState: {
      skills: { "lg:letsgo-apply": "loaded", "lg:letsgo-tdd": "loaded" },
      agents: { "lg:letsgo-reviewer": { status: "passed", attempts: 1 } },
    },
    nextStage: "verify",
  });
  await resetRuntimeState({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "verify",
  });
  await recordSkillCompleted({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "verify",
    skillName: "lg:letsgo-verify",
  });
  await recordAgentStarted({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "verify",
    agentType: "lg:letsgo-verify-writer",
    agentId: "writer-1",
  });
  await recordAgentStopped({
    projectDir,
    sessionId: "session-1",
    changeId: "regenerate-last-reply",
    stage: "verify",
    agentType: "lg:letsgo-verify-writer",
    agentId: "writer-1",
    lastAssistantMessage:
      'LETGO_RESULT {"stage":"verify","role":"writer","status":"ready","filesChanged":["verification.md"],"evidence":["329 tests"],"risks":[]}',
  });
  for (const agentId of ["reviewer-1", "reviewer-2"]) {
    await recordAgentStarted({
      projectDir,
      sessionId: "session-1",
      changeId: "regenerate-last-reply",
      stage: "verify",
      agentType: "lg:letsgo-reviewer",
      agentId,
    });
    await recordAgentStopped({
      projectDir,
      sessionId: "session-1",
      changeId: "regenerate-last-reply",
      stage: "verify",
      agentType: "lg:letsgo-reviewer",
      agentId,
      lastAssistantMessage:
        'LETGO_RESULT {"stage":"verify","role":"reviewer","status":"blocked","blocking":["移动端验收未完成"],"evidence":["验收9"],"risks":[]}',
    });
  }
}

async function prepareBlockedClarify(projectDir) {
  await initProject({ projectDir });
  await newChangeProject({ projectDir, changeId: "clarify-again" });
  await selectProject({ projectDir, changeId: "clarify-again" });
  await resetRuntimeState({
    projectDir,
    sessionId: "session-1",
    changeId: "clarify-again",
    stage: "clarify",
  });
  await recordSkillCompleted({
    projectDir,
    sessionId: "session-1",
    changeId: "clarify-again",
    stage: "clarify",
    skillName: "lg:letsgo-clarify",
  });
  for (const agentId of ["reviewer-1", "reviewer-2"]) {
    await recordAgentStarted({
      projectDir,
      sessionId: "session-1",
      changeId: "clarify-again",
      stage: "clarify",
      agentType: "lg:letsgo-reviewer",
      agentId,
    });
    await recordAgentStopped({
      projectDir,
      sessionId: "session-1",
      changeId: "clarify-again",
      stage: "clarify",
      agentType: "lg:letsgo-reviewer",
      agentId,
      lastAssistantMessage:
        'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["验收标准仍不明确"],"evidence":["proposal.md"],"risks":[]}',
    });
  }
}

test("reopen 将阻塞的 verify 安全退回 apply 并保留审计历史", async () => {
  await withTempProject(async (projectDir) => {
    await prepareBlockedVerify(projectDir);

    const result = await reopenProject({
      projectDir,
      changeId: "regenerate-last-reply",
      state: "apply",
      reason: "verify reviewer 确认验收 9 与浏览器验收未完成",
    });

    assert.equal(result.ok, true);
    assert.equal(result.reopened, true);
    assert.equal(result.fromState, "verify");
    assert.equal(result.status.state, "apply");
    assert.deepEqual(result.status.completed, ["clarify", "design", "plan"]);
    assert.equal(result.status.approved.plan, true);
    assert.equal(result.status.approved.apply, false);
    assert.equal(result.status.approved.verify, false);
    assert.equal(result.status.approved.archive, false);
    assert.equal(result.status.reopens.length, 1);
    assert.equal(result.status.reopens[0].reviewer.status, "blocked");
    assert.equal(result.status.reopens[0].reviewer.attempts, 2);
    assert.equal(await readActiveMarker(projectDir), "regenerate-last-reply");

    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.changeId, "regenerate-last-reply");
    assert.equal(runtime.stage, "apply");
    assert.deepEqual(runtime.skills, {});
    assert.deepEqual(runtime.agents, {});

    const summary = await readRunSummary(projectDir);
    assert.equal(summary.currentStage, "apply");
    assert.equal(summary.status, "in_progress");
    assert.equal(summary.reopens.length, 1);
    assert.equal(summary.reopens[0].fromStage, "verify");
    assert.equal(summary.reopens[0].toStage, "apply");
    assert.match(summary.reopens[0].reason, /验收 9/);
    assert.equal(
      summary.reopens[0].runtime.agents["lg:letsgo-reviewer"].status,
      "blocked"
    );
    assert.equal(
      summary.reopens[0].runtime.agents["lg:letsgo-reviewer"].attempts,
      2
    );
    assert.deepEqual(
      summary.reopens[0].invalidatedStages.map((entry) => entry.stage),
      ["apply", "verify"]
    );
    assert.deepEqual(summary.stages, []);
  });
});

test("clarify 两轮审查仍阻塞时可经用户授权重开当前阶段", async () => {
  await withTempProject(async (projectDir) => {
    await prepareBlockedClarify(projectDir);

    const result = await reopenProject({
      projectDir,
      changeId: "clarify-again",
      state: "clarify",
      reason: "用户确认补充验收标准并开启新的审查周期",
    });

    assert.equal(result.ok, true);
    assert.equal(result.reopened, true);
    assert.equal(result.fromState, "clarify");
    assert.equal(result.status.state, "clarify");
    assert.deepEqual(result.status.completed, []);
    assert.equal(result.status.approved.clarify, false);
    assert.equal(result.status.reopens.length, 1);
    assert.equal(result.status.reopens[0].reviewer.status, "blocked");
    assert.equal(result.status.reopens[0].reviewer.attempts, 2);

    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.stage, "clarify");
    assert.deepEqual(runtime.skills, {});
    assert.deepEqual(runtime.agents, {});
  });
});

test("CLI 解析 reopen 的阶段、change-id 和人工理由", async () => {
  await withTempProject(async (projectDir) => {
    await prepareBlockedVerify(projectDir);

    const { stdout } = await execFileAsync(path.join(packageRoot, "letsgo"), [
      "reopen",
      "apply",
      "--change",
      "regenerate-last-reply",
      "--reason",
      "用户确认补齐移动端和浏览器验收",
      projectDir,
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.ok, true);
    assert.equal(result.status.state, "apply");
    assert.match(result.reason, /用户确认/);
  });
});

test("reopen 必须由用户提供理由，或在两轮有效审查阻塞后重开当前阶段", async () => {
  await withTempProject(async (projectDir) => {
    await prepareBlockedVerify(projectDir);

    await assert.rejects(
      reopenProject({
        projectDir,
        changeId: "regenerate-last-reply",
        state: "apply",
        reason: "",
      }),
      /缺少人工解除理由/
    );

    const sameStage = await reopenProject({
      projectDir,
      changeId: "regenerate-last-reply",
      state: "verify",
      reason: "用户确认补充验证证据并开启新的审查周期",
    });
    assert.equal(sameStage.ok, true);
    assert.equal(sameStage.reopened, true);

    const futureStage = await reopenProject({
      projectDir,
      changeId: "regenerate-last-reply",
      state: "archive",
      reason: "用户要求重新处理",
    });
    assert.equal(futureStage.ok, false);
    assert.equal(futureStage.reopened, false);
  });
});
