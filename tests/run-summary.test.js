import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildRecoveryContext,
  readRunSummary,
  recordRunMetric,
  recordStageCompleted,
  recordStageStarted,
} from "../lib/run-summary.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-summary-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("单一 run-summary 保留阶段顺序、指标和压缩恢复上下文", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "fix-login",
      stage: "clarify",
    };
    await recordStageStarted(common);
    await recordRunMetric({
      ...common,
      metric: "permissionPrompts",
    });
    await recordRunMetric({
      ...common,
      metric: "compactions",
      detail: { trigger: "auto", phase: "post" },
    });
    await recordStageCompleted({
      ...common,
      runtimeState: {
        skills: { "lg:letsgo-clarify": "loaded" },
        agents: { "lg:letsgo-reviewer": { status: "passed" } },
      },
      nextStage: "design",
    });

    const summary = await readRunSummary(projectDir);
    assert.equal(summary.changeId, "fix-login");
    assert.equal(summary.metrics.permissionPrompts, 1);
    assert.equal(summary.metrics.compactions, 1);
    assert.equal(summary.stages[0].stage, "clarify");
    assert.equal(summary.stages[0].status, "completed");
    assert.equal(summary.currentStage, "design");

    const recovery = await buildRecoveryContext({ projectDir });
    assert.match(recovery, /fix-login/);
    assert.match(recovery, /clarify.*completed/);
    assert.match(recovery, /design/);
  });
});

test("读取 0.4.0 旧摘要时补齐新增指标默认值", async () => {
  await withTempDir(async (projectDir) => {
    const summaryDir = path.join(projectDir, "openspec/.letsgo");
    await mkdir(summaryDir, { recursive: true });
    await writeFile(
      path.join(summaryDir, "run-summary.json"),
      JSON.stringify({
        version: 1,
        changeId: "legacy-change",
        metrics: { permissionPrompts: 3 },
        stages: [],
      })
    );

    const summary = await readRunSummary(projectDir);
    assert.equal(summary.metrics.permissionPrompts, 3);
    assert.equal(summary.metrics.clarificationQuestions, 0);
    assert.equal(summary.metrics.codeGraphQueries, 0);
  });
});
