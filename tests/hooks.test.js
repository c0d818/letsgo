import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";
import { readRuntimeState } from "../lib/runtime-state.js";
import { readRunSummary } from "../lib/run-summary.js";
import { readStatus, writeStatus } from "../state/change.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-hooks-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runHookScript(script, input, projectDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(packageRoot, script)], {
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

test("PreToolUse 守卫脚本放行范围内的写入", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const { code, stdout } = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: path.join(projectDir, "openspec/changes/add-login/proposal.md"),
          content: "# Proposal",
        },
      },
      projectDir
    );
    const output = JSON.parse(stdout);

    assert.equal(code, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "allow");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /add-login 的 clarify 阶段/);
  });
});

test("PreToolUse 守卫脚本拒绝范围外的写入", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const { code, stdout } = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {
          file_path: path.join(projectDir, "openspec/changes/add-login/design.md"),
          old_string: "x",
          new_string: "y",
        },
      },
      projectDir
    );
    const output = JSON.parse(stdout);

    assert.equal(code, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /design\.md/);
  });
});

test("PreToolUse 守卫脚本放行只读 bash，对无路径写入请求审查", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const readOnly = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status" },
      },
      projectDir
    );
    assert.equal(JSON.parse(readOnly.stdout).hookSpecificOutput.permissionDecision, "allow");

    const pathless = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm publish" },
      },
      projectDir
    );
    assert.equal(JSON.parse(pathless.stdout).hookSpecificOutput.permissionDecision, "ask");

    const grepWithNullRedirect = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "grep -rn validateAgentPrompt openspec/.letsgo/runtime-state.json 2>/dev/null",
        },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(grepWithNullRedirect.stdout).hookSpecificOutput.permissionDecision,
      "allow"
    );

    const grepWithFileRedirect = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "grep -rn validateAgentPrompt . > result.txt" },
      },
      projectDir
    );
    assert.notEqual(
      JSON.parse(grepWithFileRedirect.stdout).hookSpecificOutput.permissionDecision,
      "allow"
    );
  });
});

test("完成生命周期后允许本地 git add/commit 与安全交付链，但 push 仍请求批准", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "done-change" });
    const status = await readStatus(projectDir, "done-change");
    await writeStatus(projectDir, "done-change", {
      ...status,
      state: "done",
      completed: ["clarify", "design", "plan", "apply", "verify", "archive"],
      approved: Object.fromEntries(
        ["clarify", "design", "plan", "apply", "verify", "archive"].map((stage) => [stage, true])
      ),
    });

    for (const command of [
      "git add src/index.js openspec/changes/done-change",
      "git commit -m 'fix: complete change'",
      "git add src/index.js openspec/changes/done-change && git commit -m 'fix: complete change'",
      "git add src/index.js openspec/changes/done-change && git diff --cached --stat",
      "git commit -m 'fix: complete change' && git show --stat",
      `git add src/index.js openspec/changes/done-change && git commit -m "$(cat <<'EOF'
fix: complete change

Keep the delivery local.
EOF
)"`,
    ]) {
      const result = await runHookScript(
        "scripts/guard.js",
        {
          session_id: "session-1",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command },
        },
        projectDir
      );
      assert.equal(
        JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
        "allow",
        command
      );
    }

    const push = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin main" },
      },
      projectDir
    );
    assert.equal(JSON.parse(push.stdout).hookSpecificOutput.permissionDecision, "ask");

    for (const command of [
      "git add src/index.js && rm src/index.js",
      "git add src/index.js && git commit -m 'fix: complete change' && git push origin main",
      "git commit --amend -m 'rewrite history'",
      "git commit --fixup=HEAD",
      "git commit --squash=HEAD",
    ]) {
      const unsafe = await runHookScript(
        "scripts/guard.js",
        {
          session_id: "session-1",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command },
        },
        projectDir
      );
      assert.equal(
        JSON.parse(unsafe.stdout).hookSpecificOutput.permissionDecision,
        "deny",
        command
      );
    }
  });
});

test("没有已完成生命周期时不开放本地 Git 交付命令", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });

    for (const command of [
      "git add src/index.js",
      "git commit -m 'chore: unrelated change'",
    ]) {
      const result = await runHookScript(
        "scripts/guard.js",
        {
          session_id: "session-1",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command },
        },
        projectDir
      );
      assert.equal(
        JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
        "deny",
        command
      );
    }
  });
});

test("完成生命周期后仍允许记录 LetsGo 运行问题，但拒绝普通文件写入", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "done-change" });
    const status = await readStatus(projectDir, "done-change");
    await writeStatus(projectDir, "done-change", {
      ...status,
      state: "done",
      completed: ["clarify", "design", "plan", "apply", "verify", "archive"],
      approved: Object.fromEntries(
        ["clarify", "design", "plan", "apply", "verify", "archive"].map((stage) => [stage, true])
      ),
    });

    const issueWrite = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: path.join(projectDir, "openspec/.letsgo/issues.md"),
          content: "# issue",
        },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(issueWrite.stdout).hookSpecificOutput.permissionDecision,
      "allow"
    );

    const sourceWrite = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: path.join(projectDir, "src/index.js"),
          content: "// unexpected",
        },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(sourceWrite.stdout).hookSpecificOutput.permissionDecision,
      "deny"
    );

    const issueDelete = await runHookScript(
      "scripts/guard.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "rm openspec/.letsgo/issues.md" },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(issueDelete.stdout).hookSpecificOutput.permissionDecision,
      "deny"
    );
  });
});

test("PreToolUse 守卫脚本在钩子输入无法解析时请求审查", async () => {
  await withTempProject(async (projectDir) => {
    const child = spawn(process.execPath, [path.join(packageRoot, "scripts/guard.js")], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    const result = await new Promise((resolve, reject) => {
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout }));
      child.stdin.write("not-json{");
      child.stdin.end();
    });

    const output = JSON.parse(result.stdout);
    assert.equal(result.code, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "ask");
  });
});

test("运行状态 Hook 在启动 reviewer 前检查 Skill 并记录通过结果", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const blocked = await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: {
          subagent_type: "lg:letsgo-reviewer",
          prompt: [
            'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["证据"],"risks":[]}',
            'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["问题"],"evidence":["证据"],"risks":[]}',
          ].join("\n"),
        },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,
      "deny"
    );

    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "PostToolUse",
        tool_name: "Skill",
        tool_input: { skill: "lg:letsgo-clarify" },
      },
      projectDir
    );

    await writeFile(
      path.join(projectDir, "openspec/changes/add-login/proposal.md"),
      "# 提案\n\n## 为什么做\n增加登录。\n\n## 改变什么\n实现认证。\n\n## 验收标准\n测试通过。\n"
    );

    for (const toolName of ["Agent", "Task"]) {
      for (const subagentType of ["general-purpose", "lg:review", "lg:review-anything", null]) {
        const arbitrary = await runHookScript(
          "scripts/runtime-state.js",
          {
            session_id: "session-1",
            hook_event_name: "PreToolUse",
            tool_name: toolName,
            tool_input: {
              subagent_type: subagentType,
              prompt: "Review the current change.",
            },
          },
          projectDir
        );
        const output = JSON.parse(arbitrary.stdout).hookSpecificOutput;
        assert.equal(output.permissionDecision, "deny", `${toolName}:${subagentType}`);
        assert.match(output.permissionDecisionReason, /lg:letsgo-reviewer/);
      }
    }

    const obsolete = await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: {
          subagent_type: "letsgo-reviewer",
          prompt: 'LETGO_RESULT: {"review":"passed"}',
        },
      },
      projectDir
    );
    assert.equal(
      JSON.parse(obsolete.stdout).hookSpecificOutput.permissionDecision,
      "deny"
    );

    for (const toolName of ["Agent", "Task"]) {
      const allowed = await runHookScript(
        "scripts/runtime-state.js",
        {
          session_id: "session-1",
          hook_event_name: "PreToolUse",
          tool_name: toolName,
          tool_input: {
            subagent_type: "lg:letsgo-reviewer",
            prompt: [
              'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["证据"],"risks":[]}',
              'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"blocked","blocking":["问题"],"evidence":["证据"],"risks":[]}',
            ].join("\n"),
          },
        },
        projectDir
      );
      assert.equal(
        JSON.parse(allowed.stdout).hookSpecificOutput.permissionDecision,
        "allow",
        toolName
      );
    }

    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "SubagentStart",
        agent_type: "lg:letsgo-reviewer",
        agent_id: "reviewer-1",
      },
      projectDir
    );
    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "SubagentStop",
        agent_type: "lg:letsgo-reviewer",
        agent_id: "reviewer-1",
        last_assistant_message:
          '通过\nLETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["proposal 通过"],"risks":[]}',
      },
      projectDir
    );

    const state = await readRuntimeState(projectDir);
    assert.equal(state.skills["lg:letsgo-clarify"], "loaded");
    assert.equal(state.agents["lg:letsgo-reviewer"].status, "passed");
  });
});

test("运行状态 Hook 兼容 CodeAgent3 camelCase 事件字段", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "PostToolUse",
        toolName: "Skill",
        toolInput: { skillName: "lg:letsgo-clarify" },
        workingDirectory: projectDir,
      },
      projectDir
    );

    const state = await readRuntimeState(projectDir);
    assert.equal(state.sessionId, "codeagent-session-1");
    assert.equal(state.skills["lg:letsgo-clarify"], "loaded");
  });
});

test("Apply Hook 接受 partial 协议并拒绝仍在运行的重复 Writer", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "many-tasks" });
    await writeStatus(projectDir, "many-tasks", {
      ...(await readStatus(projectDir, "many-tasks")),
      state: "apply",
      completed: ["clarify", "design", "plan"],
      approved: { clarify: true, design: true, plan: true },
    });

    for (const skill of ["lg:letsgo-apply", "lg:letsgo-tdd"]) {
      await runHookScript(
        "scripts/runtime-state.js",
        {
          session_id: "session-apply",
          hook_event_name: "PostToolUse",
          tool_name: "Skill",
          tool_input: { skill },
        },
        projectDir
      );
    }

    const toolInput = {
      subagent_type: "lg:letsgo-apply-writer",
      prompt:
        'LETGO_RESULT {"stage":"apply","role":"writer","status":"partial","filesChanged":["src/config.js"],"evidence":["豁免 TDD"],"remainingTasks":["3.1"],"risks":[]}',
    };
    const first = await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-apply",
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: toolInput,
      },
      projectDir
    );
    assert.equal(JSON.parse(first.stdout).hookSpecificOutput.permissionDecision, "allow");

    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-apply",
        hook_event_name: "SubagentStart",
        agent_type: "lg:letsgo-apply-writer",
        agent_id: "writer-running",
      },
      projectDir
    );
    const duplicate = await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-apply",
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: toolInput,
      },
      projectDir
    );
    const output = JSON.parse(duplicate.stdout).hookSpecificOutput;
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /正在运行|重复启动/);
  });
});

test("后台 Agent 缺少 SubagentStop 时从 transcript 补记完成结果", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "async-apply" });
    await writeStatus(projectDir, "async-apply", {
      ...(await readStatus(projectDir, "async-apply")),
      state: "apply",
      completed: ["clarify", "design", "plan"],
      approved: { clarify: true, design: true, plan: true },
    });

    for (const skill of ["lg:letsgo-apply", "lg:letsgo-tdd"]) {
      await runHookScript(
        "scripts/runtime-state.js",
        {
          session_id: "session-async",
          hook_event_name: "PostToolUse",
          tool_name: "Skill",
          tool_input: { skill },
        },
        projectDir
      );
    }

    const transcriptPath = path.join(projectDir, ".claude-session", "session-async.jsonl");
    const agentTranscriptPath = path.join(
      path.dirname(transcriptPath),
      path.basename(transcriptPath, path.extname(transcriptPath)),
      "subagents",
      "agent-writer-async.jsonl"
    );
    await mkdir(path.dirname(agentTranscriptPath), { recursive: true });
    await writeFile(transcriptPath, "");

    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-async",
        transcript_path: transcriptPath,
        hook_event_name: "SubagentStart",
        agent_type: "lg:letsgo-apply-writer",
        agent_id: "writer-async",
      },
      projectDir
    );
    await writeFile(
      agentTranscriptPath,
      `${JSON.stringify({
        message: {
          role: "assistant",
          content: [{
            type: "text",
            text: '完成\nLETGO_RESULT {"stage":"apply","role":"writer","status":"partial","filesChanged":["src/config.js"],"evidence":["任务 2.1"],"remainingTasks":["3.1"],"risks":[]}',
          }],
        },
      })}\n`
    );

    const next = await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-async",
        transcript_path: transcriptPath,
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: {
          subagent_type: "lg:letsgo-apply-writer",
          prompt: "处理下一个未完成任务。",
        },
      },
      projectDir
    );
    assert.equal(JSON.parse(next.stdout).hookSpecificOutput.permissionDecision, "allow");

    const runtime = await readRuntimeState(projectDir);
    assert.equal(runtime.skills["lg:letsgo-apply"], "loaded");
    assert.equal(runtime.skills["lg:letsgo-tdd"], "loaded");
    assert.equal(runtime.agents["lg:letsgo-apply-writer"].status, "incomplete");
    assert.deepEqual(
      runtime.agents["lg:letsgo-apply-writer"].result.remainingTasks,
      ["3.1"]
    );
  });
});

test("CodeAgent3 通过 Agent 工具响应记录只读 reviewer 结果", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "PostToolUse",
        toolName: "Skill",
        toolInput: { skillName: "lg:letsgo-clarify" },
        workingDirectory: projectDir,
      },
      projectDir
    );
    await writeFile(
      path.join(projectDir, "openspec/changes/add-login/proposal.md"),
      "# 提案\n\n## 为什么做\n增加登录。\n\n## 改变什么\n实现认证。\n\n## 验收标准\n测试通过。\n"
    );
    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "SubagentStart",
        agentType: "lg:letsgo-reviewer",
        agentId: "reviewer-1",
        workingDirectory: projectDir,
      },
      projectDir
    );
    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "PostToolUse",
        toolName: "Agent",
        toolInput: { subagentType: "lg:letsgo-reviewer" },
        toolResponse: {
          agentId: "reviewer-1",
          content: [
            { type: "text", text: "审查通过" },
            {
              type: "text",
              text: 'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["proposal 通过"],"risks":[]}',
            },
          ],
        },
        workingDirectory: projectDir,
      },
      projectDir
    );

    const state = await readRuntimeState(projectDir);
    assert.equal(state.agents["lg:letsgo-reviewer"].status, "passed");
    assert.equal(state.agents["lg:letsgo-reviewer"].attempts, 1);
  });
});

test("CodeAgent3 将 lg:review 事件归一化为 letsgo reviewer", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "PostToolUse",
        toolName: "Skill",
        toolInput: { skillName: "lg:letsgo-clarify" },
        workingDirectory: projectDir,
      },
      projectDir
    );
    await writeFile(
      path.join(projectDir, "openspec/changes/add-login/proposal.md"),
      "# 提案\n\n## 为什么做\n增加登录。\n\n## 改变什么\n实现认证。\n\n## 验收标准\n测试通过。\n"
    );

    const preTool = await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "PreToolUse",
        toolName: "Agent",
        toolInput: { subagentType: "lg:letsgo-reviewer" },
        workingDirectory: projectDir,
      },
      projectDir
    );
    assert.equal(
      JSON.parse(preTool.stdout).hookSpecificOutput.permissionDecision,
      "allow"
    );

    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "SubagentStart",
        agentType: "lg:review",
        agentId: "reviewer-1",
        workingDirectory: projectDir,
      },
      projectDir
    );
    await runHookScript(
      "scripts/runtime-state.js",
      {
        sessionId: "codeagent-session-1",
        hookEventName: "SubagentStop",
        agentType: "lg:review",
        agentId: "reviewer-1",
        lastAssistantMessage:
          'LETGO_RESULT {"stage":"clarify","role":"reviewer","status":"pass","blocking":[],"evidence":["proposal 通过"],"risks":[]}',
        workingDirectory: projectDir,
      },
      projectDir
    );

    const state = await readRuntimeState(projectDir);
    assert.equal(state.agents["lg:letsgo-reviewer"].status, "passed");
    assert.equal(state.agents["lg:letsgo-reviewer"].attempts, 1);
    assert.equal(state.agents["lg:review"], undefined);
  });
});

test("context 脚本注入生命周期规则和活跃变更状态", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const { code, stdout } = await runHookScript(
      "scripts/context.js",
      {
        session_id: "session-1",
        hook_event_name: "SessionStart",
        working_directory: projectDir,
      },
      projectDir
    );
    const output = JSON.parse(stdout);
    const context = output.hookSpecificOutput.additionalContext;

    assert.equal(code, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(context, /LetsGo 运行时守卫已启用/);
    assert.match(context, /当前 LetsGo 变更：add-login，类型：feature，阶段：clarify/);
    assert.match(context, /clarify -> design -> plan -> apply -> verify -> archive -> done/);
  });
});

test("context 脚本在用户消息时只注入当前变更摘要", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const { code, stdout } = await runHookScript(
      "scripts/context.js",
      {
        session_id: "session-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "继续",
        working_directory: projectDir,
      },
      projectDir
    );
    const output = JSON.parse(stdout);
    const context = output.hookSpecificOutput.additionalContext;

    assert.equal(code, 0);
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(context, /当前 LetsGo 变更：add-login/);
    assert.doesNotMatch(context, /LetsGo 运行时守卫已启用/);
  });
});

test("context 脚本在未由 LetsGo 管理的项目中保持静默", async () => {
  await withTempProject(async (projectDir) => {
    const { code, stdout } = await runHookScript(
      "scripts/context.js",
      {
        session_id: "session-1",
        hook_event_name: "SessionStart",
        working_directory: projectDir,
      },
      projectDir
    );

    assert.equal(code, 0);
    assert.equal(stdout.trim(), "{}");
  });
});

test("Hook 用单一 run-summary 统计权限提示、压缩和重复 Guard 拒绝", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    await runHookScript(
      "scripts/runtime-state.js",
      {
        session_id: "session-1",
        hook_event_name: "PostToolUse",
        tool_name: "Skill",
        tool_input: { skill: "lg:letsgo-clarify" },
      },
      projectDir
    );

    await runHookScript(
      "scripts/metrics.js",
      {
        session_id: "session-1",
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "npm publish" },
      },
      projectDir
    );
    await runHookScript(
      "scripts/metrics.js",
      {
        session_id: "session-1",
        hook_event_name: "PermissionRequest",
        tool_name: "AskUserQuestion",
      },
      projectDir
    );
    await runHookScript(
      "scripts/metrics.js",
      {
        session_id: "session-1",
        hook_event_name: "PostCompact",
        trigger: "auto",
        compact_summary: "summary",
      },
      projectDir
    );

    const blockedInput = {
      session_id: "session-1",
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {
        file_path: path.join(projectDir, "src/index.js"),
        content: "x",
      },
    };
    const first = await runHookScript("scripts/guard.js", blockedInput, projectDir);
    const second = await runHookScript("scripts/guard.js", blockedInput, projectDir);
    assert.equal(JSON.parse(first.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(
      JSON.parse(second.stdout).hookSpecificOutput.permissionDecisionReason,
      /已被阻止 2 次/
    );

    const summary = await readRunSummary(projectDir);
    assert.equal(summary.metrics.permissionPrompts, 1);
    assert.equal(summary.metrics.clarificationQuestions, 1);
    assert.equal(summary.metrics.compactions, 1);
    assert.equal(summary.metrics.guardDenials, 2);
    assert.equal(summary.metrics.repeatedGuardDenials, 1);
  });
});

test("CodeGraph 最多放行两次聚焦查询并记录实际调用数", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    const input = {
      session_id: "session-1",
      hook_event_name: "PreToolUse",
      tool_name: "mcp__plugin_lg_codegraph__codegraph_explore",
      tool_input: { query: "login flow" },
    };

    const first = JSON.parse((await runHookScript("scripts/guard.js", input, projectDir)).stdout);
    const second = JSON.parse((await runHookScript("scripts/guard.js", input, projectDir)).stdout);
    const third = JSON.parse((await runHookScript("scripts/guard.js", input, projectDir)).stdout);

    assert.equal(first.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(second.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(third.hookSpecificOutput.permissionDecision, "deny");
    assert.match(third.hookSpecificOutput.permissionDecisionReason, /CodeGraph.*2|第三次/);
    assert.equal((await readRunSummary(projectDir)).metrics.codeGraphQueries, 2);
  });
});
