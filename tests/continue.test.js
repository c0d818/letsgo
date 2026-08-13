import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";
import { continueProject } from "../cli/commands/continue.js";
import {
  REVIEWER,
  decideAgentStart,
  readRuntimeState,
  recordAgentStarted,
  recordAgentStopped,
  recordSkillCompleted,
} from "../lib/runtime-state.js";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");

async function withTempProject(fn) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "letsgo-continue-test-"));
  try {
    await fn(projectDir);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

test("continue 保留 reviewer pass 并建议直接推进", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "resume-login" });
    const common = {
      projectDir,
      sessionId: "old-session",
      changeId: "resume-login",
      stage: "clarify",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-clarify" });
    await recordAgentStarted({ ...common, agentType: REVIEWER, agentId: "reviewer-1" });
    await recordAgentStopped({
      ...common,
      agentType: REVIEWER,
      agentId: "reviewer-1",
      lastAssistantMessage:
        'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["proposal 通过"],"risks":[]}',
    });

    const result = await continueProject({ projectDir, changeId: "resume-login" });
    assert.equal(result.ok, true);
    assert.equal(result.selected.changeId, "resume-login");
    assert.equal(result.resume.action, "advance");
    assert.equal(result.resume.preservedReviewer, "passed");

    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.handoff, true);
    assert.equal(runtime.agents[REVIEWER].status, "passed");
  });
});

test("continue 允许新 session 接管未完成阶段且不复用阻塞两轮", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "resume-design" });
    const common = {
      projectDir,
      sessionId: "old-session",
      changeId: "resume-design",
      stage: "clarify",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-clarify" });
    for (const agentId of ["reviewer-1", "reviewer-2"]) {
      await recordAgentStarted({ ...common, agentType: REVIEWER, agentId });
      await recordAgentStopped({
        ...common,
        agentType: REVIEWER,
        agentId,
        lastAssistantMessage:
          'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["范围不清"],"evidence":["proposal"],"risks":[]}',
      });
    }

    const result = await continueProject({ projectDir, changeId: "resume-design" });
    assert.equal(result.resume.action, "blocked");
    assert.deepEqual(result.resume.blocking, ["范围不清"]);

    const third = await decideAgentStart({
      projectDir,
      sessionId: "new-session",
      changeId: "resume-design",
      stage: "clarify",
      agentType: REVIEWER,
      prompt: "Review proposal.md",
      enforceNamespace: true,
    });
    assert.equal(third.status, "deny");
    assert.match(third.reason, /最多|两次/);
  });
});

test("continue 在多个活跃变更时要求明确选择", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "change-a" });
    await newChangeProject({ projectDir, changeId: "change-b" });

    const result = await continueProject({ projectDir });
    assert.equal(result.ok, false);
    assert.equal(result.needsSelection, true);
    assert.deepEqual(result.active.map((item) => item.id).sort(), ["change-a", "change-b"]);
  });
});

test("CLI 解析 letsgo continue 的 change-id 与项目目录", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "cli-resume" });

    const { stdout } = await execFileAsync(path.join(packageRoot, "letsgo"), [
      "continue",
      "cli-resume",
      projectDir,
    ]);
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.selected.changeId, "cli-resume");
    assert.equal(result.resume.action, "load-skill");
  });
});
