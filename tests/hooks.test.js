import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initProject } from "../cli/commands/init.js";
import { newChangeProject } from "../cli/commands/new.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "stitches-hooks-test-"));
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
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      },
      projectDir
    );
    assert.equal(JSON.parse(pathless.stdout).hookSpecificOutput.permissionDecision, "ask");
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
    assert.equal(output.hookSpecificOutput.permissionDecision, "ask");
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
        working_directory: projectDir,
      },
      projectDir
    );
    const output = JSON.parse(stdout);
    const context = output.hookSpecificOutput.additionalContext;

    assert.equal(code, 0);
    assert.match(context, /Stitches 运行时守卫已启用/);
    assert.match(context, /当前 Stitches 变更：add-login，类型：feature，阶段：clarify/);
    assert.match(context, /clarify -> design -> plan -> apply -> verify -> archive -> done/);
  });
});

test("context 脚本在未由 Stitches 管理的项目中保持静默", async () => {
  await withTempProject(async (projectDir) => {
    const { code, stdout } = await runHookScript(
      "scripts/context.js",
      {
        session_id: "session-1",
        working_directory: projectDir,
      },
      projectDir
    );

    assert.equal(code, 0);
    assert.equal(stdout.trim(), "{}");
  });
});
