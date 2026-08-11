import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";
import { recoverProject } from "../cli/commands/recover.js";
import {
  readRuntimeState,
  resetRuntimeState,
} from "../lib/runtime-state.js";

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-recover-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("recover 清理幽灵 runtime 并恢复唯一活跃变更", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "real-change" });
    await resetRuntimeState({
      projectDir,
      sessionId: "session-1",
      changeId: "ghost-change",
      stage: "clarify",
    });

    const result = await recoverProject({ projectDir });
    assert.equal(result.ok, true);
    assert.equal(result.selected.changeId, "real-change");
    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.changeId, "real-change");
    assert.equal(runtime.stage, "clarify");
    assert.deepEqual(runtime.skills, {});
    const active = JSON.parse(
      await readFile(path.join(projectDir, "openspec/.letsgo/active.json"), "utf8")
    );
    assert.equal(active.changeId, "real-change");
  });
});

test("recover 在没有活跃变更时清空残留 current runtime", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await resetRuntimeState({
      projectDir,
      sessionId: "session-1",
      changeId: "ghost-change",
      stage: "clarify",
    });
    const result = await recoverProject({ projectDir });
    assert.equal(result.ok, true);
    assert.equal(result.selected, null);
    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.changeId, null);
    assert.equal(runtime.stage, null);
  });
});
