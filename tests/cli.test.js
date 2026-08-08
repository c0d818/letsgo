import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { initProject } from "../cli/commands/init.js";
import { disableProject } from "../cli/commands/disable.js";
import { enableProject } from "../cli/commands/enable.js";
import { doctorProject } from "../cli/commands/doctor.js";
import { newChangeProject } from "../cli/commands/new.js";
import { statusProject } from "../cli/commands/status.js";
import { validateProject } from "../cli/commands/validate.js";
import { advanceProject } from "../cli/commands/advance.js";
import { selectProject } from "../cli/commands/select.js";
import {
  activeChanges,
  buildSystemRules,
  decideToolUse,
  isStitchesProject,
  readActiveMarker,
  resolveActiveChange,
} from "../guard.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "stitches-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("init 把 Stitches 模板安装进项目", async () => {
  await withTempProject(async (projectDir) => {
    const result = await initProject({ projectDir });

    assert.equal(result.created.length > 0, true);
    assert.match(
      await readFile(path.join(projectDir, "CLAUDE.md"), "utf8"),
      /简体中文/
    );
    assert.match(
      await readFile(path.join(projectDir, ".claude/commands/start.md"), "utf8"),
      /Stitches/
    );
    assert.match(
      await readFile(path.join(projectDir, ".claude/skills/stitches-workflow/SKILL.md"), "utf8"),
      /Stitches/
    );
    await stat(path.join(projectDir, ".claude/skills/stitches-clarify/SKILL.md"));
    await stat(path.join(projectDir, ".claude/commands/check.md"));
    await stat(path.join(projectDir, ".claude/commands/structure.md"));
    await assert.rejects(
      stat(path.join(projectDir, ".claude/commands/maintenance.md")),
      { code: "ENOENT" }
    );
    for (const agent of [
      "stitches-design-writer",
      "stitches-plan-writer",
      "stitches-apply-writer",
      "stitches-verify-writer",
      "stitches-archive-writer",
      "stitches-reviewer",
    ]) {
      await stat(path.join(projectDir, `.claude/agents/${agent}.md`));
    }
    await assert.rejects(
      stat(path.join(projectDir, ".claude/agents/stitches-design-reviewer.md")),
      { code: "ENOENT" }
    );
    const claudeSettings = JSON.parse(
      await readFile(path.join(projectDir, ".claude/settings.json"), "utf8")
    );
    assert.deepEqual(claudeSettings.permissions.ask, [
      "Bash",
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
    ]);
    assert.match(
      await readFile(path.join(projectDir, "openspec/change-types/bugfix/proposal.md"), "utf8"),
      /遵循 CLAUDE\.md 中的语言规则[\s\S]*缺陷修复提案/
    );
    assert.match(
      await readFile(path.join(projectDir, "openspec/change-types/bugfix/design.md"), "utf8"),
      /缺陷修复设计/
    );
    await assert.rejects(
      stat(path.join(projectDir, "openspec/change-types/common")),
      { code: "ENOENT" }
    );
    await assert.rejects(
      stat(path.join(projectDir, "openspec/project.md")),
      { code: "ENOENT" }
    );
    await assert.rejects(
      stat(path.join(projectDir, "openspec/changes")),
      { code: "ENOENT" }
    );
    await assert.rejects(
      stat(path.join(projectDir, "openspec/specs")),
      { code: "ENOENT" }
    );
    await assert.rejects(
      stat(path.join(projectDir, "opencode.json")),
      { code: "ENOENT" }
    );
    assert.deepEqual(
      result.created.filter((entry) => entry.includes(".DS_Store")),
      []
    );
    assert.deepEqual(
      (await readdir(path.join(projectDir, ".claude/skills"))).sort(),
      [
        "stitches-apply",
        "stitches-archive",
        "stitches-bugfix",
        "stitches-clarify",
        "stitches-design",
        "stitches-feature",
        "stitches-maintenance",
        "stitches-plan",
        "stitches-refactor",
        "stitches-review",
        "stitches-spec",
        "stitches-tdd",
        "stitches-test",
        "stitches-verify",
        "stitches-workflow",
      ]
    );
  });
});

test("disable 和 enable 软切换 .claude 下的 Stitches 条目", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });

    const disabled = await disableProject({ projectDir });
    assert.deepEqual(disabled.disabled.sort(), [".claude/commands", ".claude/skills"]);

    const enabled = await enableProject({ projectDir });
    assert.deepEqual(enabled.enabled.sort(), [".claude/commands", ".claude/skills"]);
  });
});

test("doctor 报告 Stitches 是否已安装", async () => {
  await withTempProject(async (projectDir) => {
    assert.equal((await doctorProject({ projectDir })).installed, false);

    await initProject({ projectDir });

    const result = await doctorProject({ projectDir });
    assert.equal(result.installed, true);
    assert.equal(result.commands, true);
    assert.equal(result.skills, true);
    assert.equal(result.openspec, true);
    assert.equal(result.claudeSettings, true);
  });
});

test("claude 插件清单和市场配置有效", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, ".claude-plugin/plugin.json"), "utf8")
  );
  const marketplace = JSON.parse(
    await readFile(path.join(packageRoot, ".claude-plugin/marketplace.json"), "utf8")
  );

  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.description, "string");
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].version, manifest.version);
  assert.equal(marketplace.plugins[0].source, "./");
});

test("hooks.json 正确接线 PreToolUse、SessionStart 和 UserPromptSubmit", async () => {
  const hooks = JSON.parse(
    await readFile(path.join(packageRoot, "hooks/hooks.json"), "utf8")
  );

  assert.match(hooks.hooks.PreToolUse[0].matcher, /Bash\|Write\|Edit\|MultiEdit\|NotebookEdit/);
  assert.match(
    hooks.hooks.PreToolUse[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/guard\.js/
  );
  assert.match(
    hooks.hooks.SessionStart[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/context\.js/
  );
  assert.match(
    hooks.hooks.UserPromptSubmit[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/context\.js/
  );
});

test("cli init 把第一个位置参数当作项目目录", async () => {
  await withTempProject(async (projectDir) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "stitches"), "init", projectDir],
      { cwd: packageRoot }
    );
    const result = JSON.parse(stdout);

    assert.equal(result.projectDir, projectDir);
    await stat(path.join(projectDir, "CLAUDE.md"));
    await stat(path.join(projectDir, ".claude/commands/start.md"));
  });
});

test("cli new 和 status 使用位置参数指定项目目录", async () => {
  await withTempProject(async (projectDir) => {
    await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "stitches"), "init", projectDir],
      { cwd: packageRoot }
    );

    const created = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "stitches"), "new", "demo-change", "--type", "bugfix", projectDir],
      { cwd: packageRoot }
    );
    const createResult = JSON.parse(created.stdout);

    assert.equal(createResult.projectDir, projectDir);
    assert.equal(createResult.type, "bugfix");
    await stat(path.join(projectDir, "openspec/changes/demo-change/status.json"));
    assert.match(
      await readFile(path.join(projectDir, "openspec/changes/demo-change/proposal.md"), "utf8"),
      /缺陷修复提案/
    );
    assert.match(
      await readFile(path.join(projectDir, "openspec/changes/demo-change/design.md"), "utf8"),
      /缺陷修复设计/
    );
    await stat(path.join(projectDir, "openspec/changes/demo-change/specs/_placeholder/spec.md"));

    const checked = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "stitches"), "status", "--change", "demo-change", projectDir],
      { cwd: packageRoot }
    );
    const statusResult = JSON.parse(checked.stdout);

    assert.equal(statusResult.projectDir, projectDir);
    assert.equal(statusResult.status.state, "clarify");
    assert.equal(statusResult.status.type, "bugfix");
  });
});

test("cli select 记录当前变更标记", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    await newChangeProject({ projectDir, changeId: "add-audit" });

    assert.equal(await readActiveMarker(projectDir), null);

    const result = await selectProject({ projectDir, changeId: "add-login" });
    assert.equal(result.changeId, "add-login");
    assert.equal(await readActiveMarker(projectDir), "add-login");

    const selected = await resolveActiveChange(projectDir);
    assert.equal(selected.changeId, "add-login");
    assert.equal(selected.state, "clarify");
  });
});

test("运行时守卫在没有活跃变更时阻止写入", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });

    const decision = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(projectDir, "src/app.js"),
        content: "// hi",
      },
    });

    assert.equal(decision.status, "deny");
    assert.match(decision.reason, /未选择活跃的 Stitches 变更/);
  });
});

test("运行时守卫放行未由 Stitches 管理的项目", async () => {
  await withTempProject(async (projectDir) => {
    assert.equal(await isStitchesProject(projectDir), false);

    const writeDecision = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(projectDir, "src/app.js"),
        content: "// hi",
      },
    });
    assert.equal(writeDecision.status, "allow");
    assert.match(writeDecision.reason, /未由 Stitches 管理/);

    const rules = await buildSystemRules({ projectDir });
    assert.equal(rules, "");

    await initProject({ projectDir });
    assert.equal(await isStitchesProject(projectDir), true);
  });
});

test("运行时守卫把写入限制在当前阶段范围", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });
    const changeDir = path.join(projectDir, "openspec/changes/add-login");

    const clarifyWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(changeDir, "proposal.md"),
        content: "# Proposal",
      },
    });
    assert.equal(clarifyWrite.status, "allow");

    const skippedWrite = await decideToolUse({
      projectDir,
      toolName: "Edit",
      toolInput: {
        file_path: path.join(changeDir, "design.md"),
        old_string: "x",
        new_string: "y",
      },
    });
    assert.equal(skippedWrite.status, "deny");
    assert.match(skippedWrite.reason, /design\.md/);

    await writeFile(path.join(changeDir, "proposal.md"), [
      "# Feature Proposal",
      "Why: Users need authenticated access.",
      "What Changes: Add login.",
      "Acceptance Criteria: User can sign in.",
      "",
    ].join("\n"));
    await advanceProject({ projectDir, changeId: "add-login", state: "clarify" });

    const designSpecWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(changeDir, "specs/auth/spec.md"),
        content: "# Spec",
      },
    });
    assert.equal(designSpecWrite.status, "allow");

    const designSrcWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(projectDir, "src/app.js"),
        content: "// hi",
      },
    });
    assert.equal(designSrcWrite.status, "deny");

    await writeFile(path.join(changeDir, "design.md"), [
      "# Design",
      "Architecture: Add auth module.",
      "Test Strategy: Unit test login flow.",
      "",
    ].join("\n"));
    await advanceProject({ projectDir, changeId: "add-login", state: "design" });
    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [x] Add failing login test",
      "- [x] Implement login",
      "",
    ].join("\n"));
    await advanceProject({ projectDir, changeId: "add-login", state: "plan" });

    const applyWrite = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: "mkdir -p src && echo ok > src/app.js",
      },
    });
    assert.equal(applyWrite.status, "allow");

    const prematureVerifyWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(changeDir, "verification.md"),
        content: "# Verification",
      },
    });
    assert.equal(prematureVerifyWrite.status, "deny");
  });
});

test("运行时守卫在写入看不到文件路径时请求审查", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const decision = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: "npm test",
      },
    });

    assert.equal(decision.status, "ask");
    assert.match(decision.reason, /未看到文件路径/);
  });
});

test("运行时守卫放行只读 bash 和 stitches CLI 命令", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const readOnly = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: { command: "git status" },
    });
    assert.equal(readOnly.status, "allow");

    const cliCommand = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: "stitches validate --before clarify --change add-login",
      },
    });
    assert.equal(cliCommand.status, "allow");
  });
});

test("运行时守卫自动解析唯一的活跃变更", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const active = await activeChanges(projectDir);
    assert.deepEqual(active, [{ id: "add-login", state: "clarify", type: "feature" }]);

    const selected = await resolveActiveChange(projectDir, active);
    assert.deepEqual(selected, {
      changeId: "add-login",
      state: "clarify",
      type: "feature",
    });
  });
});

test("运行时守卫把活跃状态注入系统规则", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    assert.match(
      await readFile(path.join(projectDir, ".claude/commands/letsgo.md"), "utf8"),
      /一键自动流程/
    );

    const rules = await buildSystemRules({ projectDir });

    assert.match(rules, /Stitches 运行时守卫已启用/);
    assert.match(rules, /当前 Stitches 变更：add-login，类型：feature，阶段：clarify/);
    assert.match(rules, /add-login：clarify（feature）/);
    assert.match(rules, /规划文档默认使用简体中文/);
    assert.match(rules, /stitches select <change-id>/);
  });
});

test("状态机创建变更并阻止跳阶段", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    const created = await newChangeProject({ projectDir, changeId: "add-login" });

    assert.equal(created.status.id, "add-login");
    assert.equal(created.status.state, "clarify");

    const beforeDesign = await validateProject({
      projectDir,
      changeId: "add-login",
      mode: "before",
      state: "design",
    });

    assert.equal(beforeDesign.ok, false);
    assert.match(beforeDesign.errors.join("\n"), /clarify/);

    await writeFile(path.join(projectDir, "openspec/changes/add-login/design.md"), [
      "# Design",
      "Architecture: Add auth module.",
      "Test Strategy: Unit test login flow.",
      "",
    ].join("\n"));
    const skippedAdvance = await advanceProject({
      projectDir,
      changeId: "add-login",
      state: "design",
    });

    assert.equal(skippedAdvance.advanced, false);
    assert.match(skippedAdvance.errors.join("\n"), /当前状态是 clarify/);
  });
});

test("状态机按 clarify、design、plan、apply、verify、archive 顺序推进", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const changeDir = path.join(projectDir, "openspec/changes/add-login");
    await writeFile(path.join(changeDir, "proposal.md"), [
      "# Feature Proposal",
      "Why: Users need authenticated access.",
      "What Changes: Add login.",
      "Acceptance Criteria: User can sign in.",
      "",
    ].join("\n"));
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "clarify" })).status.state, "design");

    await writeFile(path.join(changeDir, "design.md"), [
      "# Design",
      "Architecture: Add auth module.",
      "Test Strategy: Unit test login flow.",
      "",
    ].join("\n"));
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "design" })).status.state, "plan");

    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [ ] Add failing login test",
      "- [ ] Implement login",
      "",
    ].join("\n"));
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "plan" })).status.state, "apply");

    assert.equal((await validateProject({ projectDir, changeId: "add-login", mode: "before", state: "verify" })).ok, false);
    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [x] Add failing login test",
      "- [x] Implement login",
      "",
    ].join("\n"));
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "apply" })).status.state, "verify");

    await writeFile(path.join(changeDir, "verification.md"), [
      "# Verification",
      "Status: Pass",
      "Command: npm test",
      "Exit: 0",
      "",
    ].join("\n"));
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "verify" })).status.state, "archive");

    await mkdir(path.join(projectDir, "openspec/archive"), { recursive: true });
    await writeFile(path.join(changeDir, "archive.md"), [
      "# Archive",
      "Summary: Login change archived.",
      "",
    ].join("\n"));
    const archived = await advanceProject({ projectDir, changeId: "add-login", state: "archive" });
    assert.equal(archived.status.state, "done");
    assert.deepEqual(archived.status.completed, ["clarify", "design", "plan", "apply", "verify", "archive"]);

    const status = await statusProject({ projectDir, changeId: "add-login" });
    assert.equal(status.status.state, "done");
    assert.equal(status.current.label, "已完成");
    assert.equal(status.next, null);
  });
});
