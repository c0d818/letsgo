import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";
import { continueProject } from "../cli/commands/continue.js";
import { changeDir, readStatus, writeStatus } from "../state/change.js";
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

test("continue 从完整阶段产物恢复丢失的 apply writer 检查点", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "recovered-apply" });
    const dir = changeDir(projectDir, "recovered-apply");
    await writeStatus(projectDir, "recovered-apply", {
      ...(await readStatus(projectDir, "recovered-apply")),
      state: "apply",
      completed: ["clarify", "design", "plan"],
      approved: { clarify: true, design: true, plan: true },
    });
    await writeFile(path.join(dir, "proposal.md"), "# Why\n原因\n# What Changes\n改动\n# Acceptance Criteria\n- 验收\n");
    await writeFile(path.join(dir, "design.md"), "# Architecture\n架构\n# Test Strategy\n测试策略\n");
    await writeFile(path.join(dir, "tasks.md"), "- [x] 完成实现\n");
    await writeFile(path.join(dir, "tdd-evidence.md"), [
      "模式：TDD",
      "## Cycle 1：恢复行为",
      "### RED",
      "测试命令：npm test",
      "结果：失败",
      "### GREEN",
      "测试命令：npm test",
      "结果：通过",
      "### REFACTOR",
      "测试命令：npm test",
      "结果：通过",
      "重构：无",
      "",
    ].join("\n"));

    const first = await continueProject({ projectDir, changeId: "recovered-apply" });
    assert.equal(first.resume.action, "load-skill");
    let runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.agents["lg:letsgo-apply-writer"].status, "completed");
    assert.equal(runtime.agents["lg:letsgo-apply-writer"].recoveredFromArtifacts, true);

    for (const skillName of ["lg:letsgo-apply", "lg:letsgo-tdd"]) {
      await recordSkillCompleted({
        projectDir,
        sessionId: null,
        changeId: "recovered-apply",
        stage: "apply",
        skillName,
      });
    }
    const second = await continueProject({ projectDir, changeId: "recovered-apply" });
    assert.equal(second.resume.action, "run-reviewer");
    runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.agents["lg:letsgo-apply-writer"].status, "completed");
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
