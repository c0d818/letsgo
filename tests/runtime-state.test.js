import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";

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
      (await readRuntimeState(projectDir)).skills["lg:letsgo-design"],
      "loaded"
    );
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
        '完成\nLETGO_RESULT {"stage":"design","role":"writer","status":"ready","filesChanged":["design.md"],"evidence":["校验通过"],"risks":[]}',
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
        '通过\nLETGO_RESULT {"stage":"design","role":"reviewer","status":"pass","blocking":[],"evidence":["设计覆盖验收标准"],"risks":[]}',
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

test("Agent 白名单前报告 active 变更与 continue runtime 的身份冲突", async () => {
  await withTempDir(async (projectDir) => {
    await resetRuntimeState({
      projectDir,
      sessionId: null,
      changeId: "design-change",
      stage: "design",
    });

    const decision = await decideAgentStart({
      projectDir,
      sessionId: "new-session",
      changeId: "apply-change",
      stage: "apply",
      agentType: "lg:letsgo-design-writer",
      enforceNamespace: true,
    });

    assert.equal(decision.status, "deny");
    assert.match(decision.reason, /状态冲突/);
    assert.match(decision.reason, /design-change\/design/);
    assert.match(decision.reason, /apply-change\/apply/);
    assert.match(decision.reason, /\/lg:continue apply-change/);
    assert.doesNotMatch(decision.reason, /apply 阶段只能启动/);
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

    const partialPrompt =
      'LETGO_RESULT {"stage":"apply","role":"writer","status":"partial","filesChanged":["src/config.js"],"evidence":["豁免 TDD"],"remainingTasks":["3.1"],"risks":[]}';
    assert.equal(
      (await decideAgentStart({
        ...common,
        agentType: "lg:letsgo-apply-writer",
        prompt: partialPrompt,
        enforceNamespace: true,
      })).status,
      "allow",
      "Apply Writer 的完整 partial 协议应被接受"
    );

    await recordAgentStarted({
      ...common,
      agentType: "lg:letsgo-apply-writer",
      agentId: "writer-running",
    });
    const duplicate = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-apply-writer",
      prompt: partialPrompt,
      enforceNamespace: true,
    });
    assert.equal(duplicate.status, "deny");
    assert.match(duplicate.reason, /正在运行|重复启动/);
  });
});

test("apply writer 不能在任务未完成时以 ready 通过运行时门禁", async () => {
  await withTempDir(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "finish-all-tasks" });
    const changeDir = path.join(projectDir, "openspec/changes/finish-all-tasks");
    const statusPath = path.join(changeDir, "status.json");
    const status = JSON.parse(await readFile(statusPath, "utf8"));
    await writeFile(
      statusPath,
      `${JSON.stringify({
        ...status,
        state: "apply",
        completed: ["clarify", "design", "plan"],
        approved: { clarify: true, design: true, plan: true },
      }, null, 2)}\n`
    );
    await writeFile(path.join(changeDir, "proposal.md"), "# Proposal\n已批准\n");
    await writeFile(path.join(changeDir, "design.md"), "# Design\n已批准\n");
    await writeFile(path.join(changeDir, "tasks.md"), "# Tasks\n- [x] 完成一\n- [ ] 完成二\n");
    await writeFile(
      path.join(changeDir, "tdd-evidence.md"),
      [
        "# TDD 证据",
        "模式：TDD",
        "## Cycle 1：完成一",
        "### RED",
        "- 测试命令：npm test",
        "- 结果：失败",
        "### GREEN",
        "- 测试命令：npm test",
        "- 结果：通过",
        "### REFACTOR",
        "- 重构：无",
        "- 测试命令：npm test",
        "- 结果：通过",
      ].join("\n")
    );

    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "finish-all-tasks",
      stage: "apply",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-apply" });
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-tdd" });
    await recordAgentStarted({
      ...common,
      agentType: "lg:letsgo-apply-writer",
      agentId: "writer-1",
    });
    await recordAgentStopped({
      ...common,
      agentType: "lg:letsgo-apply-writer",
      agentId: "writer-1",
      lastAssistantMessage:
        'LETGO_RESULT {"stage":"apply","role":"writer","status":"ready","filesChanged":["src/index.js"],"evidence":["Cycle 1"],"risks":[]}',
    });

    const runtime = await readRuntimeState(projectDir);
    const writer = runtime.agents["lg:letsgo-apply-writer"];
    assert.equal(writer.status, "incomplete");
    assert.match(writer.validationErrors.join("\n"), /未完成的任务/);
    const reviewer = await decideAgentStart({ ...common, agentType: REVIEWER });
    assert.equal(reviewer.status, "deny");
    assert.match(reviewer.reason, /未完成的任务/);
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
    assert.equal(JSON.parse(raw).skills["lg:letsgo-clarify"], "loaded");
  });
});

test("clarify reviewer 只有在 proposal 通过产物校验后才能启动", async () => {
  await withTempDir(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "fix-login", type: "bugfix" });
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "fix-login",
      stage: "clarify",
    };

    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-clarify" });
    const beforeProposal = await decideAgentStart({
      ...common,
      agentType: REVIEWER,
    });
    assert.equal(beforeProposal.status, "deny");
    assert.match(beforeProposal.reason, /proposal\.md/);

    await writeFile(
      path.join(projectDir, "openspec/changes/fix-login/proposal.md"),
      "# 提案\n\n## 为什么做\n修复登录。\n\n## 改变什么\n传递状态。\n\n## 验收标准\n测试通过。\n"
    );
    const afterProposal = await decideAgentStart({
      ...common,
      agentType: REVIEWER,
    });
    assert.equal(afterProposal.status, "allow");
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

test("Agent 启动前拒绝非命名空间和错误 LETGO_RESULT 协议", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "add-login",
      stage: "design",
    };
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-design" });

    const validPrompt =
      '最后一行：LETGO_RESULT {"stage":"design","role":"writer","status":"ready","filesChanged":[],"evidence":["证据"],"risks":[]}';
    const unnamespaced = await decideAgentStart({
      ...common,
      agentType: "letsgo-design-writer",
      prompt: validPrompt,
      enforceNamespace: true,
    });
    assert.equal(unnamespaced.status, "deny");
    assert.match(unnamespaced.reason, /lg:letsgo-design-writer/);

    for (const agentType of [
      "general-purpose",
      "lg:review",
      "lg:review-anything",
      "lg:letsgo-apply-writer",
      null,
    ]) {
      const arbitrary = await decideAgentStart({
        ...common,
        agentType,
        prompt: "Handle the current stage.",
        enforceNamespace: true,
      });
      assert.equal(arbitrary.status, "deny", String(agentType));
      assert.match(arbitrary.reason, /lg:letsgo-design-writer/);
      assert.match(arbitrary.reason, /lg:letsgo-reviewer/);
      assert.match(arbitrary.reason, /openspec\/changes\/add-login\/status\.json/);
      assert.match(arbitrary.reason, /\/lg:continue add-login/);
    }

    assert.equal(
      (await decideAgentStart({
        ...common,
        agentType: "general-purpose",
        enforceNamespace: false,
      })).status,
      "allow"
    );

    const legacyProtocol = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-design-writer",
      prompt: 'LETGO_RESULT: {"review":"passed"}',
      enforceNamespace: true,
    });
    assert.equal(legacyProtocol.status, "deny");
    assert.match(legacyProtocol.reason, /LETGO_RESULT.*协议/);

    const valid = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-design-writer",
      prompt: validPrompt,
      enforceNamespace: true,
    });
    assert.equal(valid.status, "allow");

    const minimal = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-design-writer",
      prompt: "Write design.md for add-login in the design stage.",
      enforceNamespace: true,
    });
    assert.equal(minimal.status, "allow");

    const partialProtocol = await decideAgentStart({
      ...common,
      agentType: "lg:letsgo-design-writer",
      prompt: 'Return LETGO_RESULT {"stage":"design","role":"writer"}',
      enforceNamespace: true,
    });
    assert.equal(partialProtocol.status, "deny");
    assert.match(partialProtocol.reason, /缺少字段|完整/);
  });
});

test("reviewer 最多启动初审和一次复审", async () => {
  await withTempDir(async (projectDir) => {
    const common = {
      projectDir,
      sessionId: "session-1",
      changeId: "fix-login",
      stage: "clarify",
    };
    const reviewerPrompt = [
      'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["证据"],"risks":[]}',
      'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["问题"],"evidence":["证据"],"risks":[]}',
    ].join("\n");
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "fix-login", type: "bugfix" });
    await recordSkillCompleted({ ...common, skillName: "lg:letsgo-clarify" });
    await writeFile(
      path.join(projectDir, "openspec/changes/fix-login/proposal.md"),
      "# 提案\n\n## 为什么做\n修复登录。\n\n## 改变什么\n传递状态。\n\n## 验收标准\n测试通过。\n"
    );

    assert.equal(
      (await decideAgentStart({
        ...common,
        agentType: REVIEWER,
        prompt: "Review proposal.md for fix-login in the clarify stage.",
        enforceNamespace: true,
      })).status,
      "allow"
    );

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      assert.equal(
        (await decideAgentStart({
          ...common,
          agentType: REVIEWER,
          prompt: reviewerPrompt,
          enforceNamespace: true,
        })).status,
        "allow"
      );
      await recordAgentStarted({
        ...common,
        agentType: REVIEWER,
        agentId: `reviewer-${attempt}`,
      });
      await recordAgentStopped({
        ...common,
        agentType: REVIEWER,
        agentId: `reviewer-${attempt}`,
        lastAssistantMessage:
          'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["仍需修订"],"evidence":["proposal"],"risks":[]}',
      });
    }

    const third = await decideAgentStart({
      ...common,
      agentType: REVIEWER,
      prompt: reviewerPrompt,
      enforceNamespace: true,
    });
    assert.equal(third.status, "deny");
    assert.match(third.reason, /最多.*2|两次/);
    assert.match(third.reason, /blocking/);
    assert.match(third.reason, /不得手动批准/);
    assert.match(third.reason, /reopen/);
    assert.equal((await readRuntimeState(projectDir)).agents[REVIEWER].attempts, 2);
  });
});
