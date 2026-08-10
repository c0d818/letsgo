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
import { validateTddEvidence } from "../state/validate.js";
import {
  REVIEWER,
  STAGE_SKILLS,
  STAGE_WRITERS,
  recordAgentStopped,
  recordSkillCompleted,
} from "../lib/runtime-state.js";
import {
  activeChanges,
  buildSystemRules,
  decideToolUse,
  isLetsGoProject,
  readActiveMarker,
  resolveActiveChange,
} from "../lib/guard.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function markRuntimeStageReady(projectDir, changeId, stage) {
  const sessionId = "test-session";
  for (const skillName of STAGE_SKILLS[stage]) {
    await recordSkillCompleted({
      projectDir,
      sessionId,
      changeId,
      stage,
      skillName,
    });
  }
  if (STAGE_WRITERS[stage]) {
    await recordAgentStopped({
      projectDir,
      sessionId,
      changeId,
      stage,
      agentType: STAGE_WRITERS[stage],
      lastAssistantMessage: `LETGO_RESULT {"stage":"${stage}","role":"writer","status":"ready"}`,
    });
  }
  await recordAgentStopped({
    projectDir,
    sessionId,
    changeId,
    stage,
    agentType: REVIEWER,
    lastAssistantMessage: `LETGO_RESULT {"stage":"${stage}","role":"reviewer","status":"pass","blocking":[]}`,
  });
}

test("init 把 LetsGo 模板安装进项目", async () => {
  await withTempProject(async (projectDir) => {
    const result = await initProject({ projectDir });

    assert.equal(result.created.length > 0, true);
    assert.match(
      await readFile(path.join(projectDir, "CLAUDE.md"), "utf8"),
      /简体中文/
    );
    assert.match(
      await readFile(path.join(projectDir, ".claude/commands/start.md"), "utf8"),
      /LetsGo/
    );
    const bugfixCommand = await readFile(
      path.join(projectDir, ".claude/commands/bugfix.md"),
      "utf8"
    );
    assert.match(bugfixCommand, /argument-hint: <修复需求描述>/);
    assert.match(bugfixCommand, /\/lg:bugfix <修复需求描述>/);
    assert.match(bugfixCommand, /change-id 由代理自己生成/);
    assert.match(bugfixCommand, /letsgo new <change-id> --type bugfix/);
    assert.match(
      await readFile(path.join(projectDir, ".claude/skills/letsgo-workflow/SKILL.md"), "utf8"),
      /LetsGo/
    );
    await stat(path.join(projectDir, ".claude/skills/letsgo-clarify/SKILL.md"));
    await stat(path.join(projectDir, ".claude/commands/check.md"));
    await stat(path.join(projectDir, ".claude/commands/structure.md"));
    await stat(path.join(projectDir, ".claude/commands/log.md"));
    await assert.rejects(
      stat(path.join(projectDir, ".claude/commands/maintenance.md")),
      { code: "ENOENT" }
    );
    for (const agent of [
      "letsgo-design-writer",
      "letsgo-plan-writer",
      "letsgo-apply-writer",
      "letsgo-verify-writer",
      "letsgo-archive-writer",
      "letsgo-reviewer",
    ]) {
      await stat(path.join(projectDir, `.claude/agents/${agent}.md`));
    }
    await assert.rejects(
      stat(path.join(projectDir, ".claude/agents/letsgo-design-reviewer.md")),
      { code: "ENOENT" }
    );
    assert.match(
      await readFile(path.join(projectDir, "openspec/change-types/bugfix/proposal.md"), "utf8"),
      /遵循 CLAUDE\.md 中的语言规则[\s\S]*缺陷修复提案/
    );
    assert.match(
      await readFile(path.join(projectDir, "openspec/change-types/bugfix/design.md"), "utf8"),
      /缺陷修复设计/
    );
    assert.match(
      await readFile(
        path.join(projectDir, "openspec/change-types/bugfix/tdd-evidence.md"),
        "utf8"
      ),
      /RED[\s\S]*GREEN[\s\S]*REFACTOR/
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
        "letsgo-apply",
        "letsgo-archive",
        "letsgo-bugfix",
        "letsgo-clarify",
        "letsgo-design",
        "letsgo-feature",
        "letsgo-maintenance",
        "letsgo-plan",
        "letsgo-refactor",
        "letsgo-review",
        "letsgo-spec",
        "letsgo-tdd",
        "letsgo-test",
        "letsgo-verify",
        "letsgo-workflow",
      ]
    );
  });
});

test("disable 和 enable 软切换 .claude 下的 LetsGo 条目", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });

    const disabled = await disableProject({ projectDir });
    assert.deepEqual(disabled.disabled.sort(), [".claude/commands", ".claude/skills"]);

    const enabled = await enableProject({ projectDir });
    assert.deepEqual(enabled.enabled.sort(), [".claude/commands", ".claude/skills"]);
  });
});

test("doctor 报告 LetsGo 是否已安装", async () => {
  await withTempProject(async (projectDir) => {
    assert.equal((await doctorProject({ projectDir })).installed, false);

    await initProject({ projectDir });

    const result = await doctorProject({ projectDir });
    assert.equal(result.installed, true);
    assert.equal(result.commands, true);
    assert.equal(result.skills, true);
    assert.equal(result.openspec, true);
  });
});

test("claude 插件清单和市场配置有效", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, ".claude-plugin/plugin.json"), "utf8")
  );
  const marketplace = JSON.parse(
    await readFile(path.join(packageRoot, ".claude-plugin/marketplace.json"), "utf8")
  );

  assert.equal(manifest.name, "lg");
  assert.equal(manifest.displayName, "LetsGo");
  assert.equal(marketplace.name, "letsgo");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.description, "string");
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].version, manifest.version);
  assert.equal(marketplace.plugins[0].source, "./");

  const commandNames = (await readdir(path.join(packageRoot, "commands")))
    .filter((name) => name.endsWith(".md"))
    .sort();
  assert.deepEqual(commandNames, [
    "bugfix.md",
    "check.md",
    "letsgo.md",
    "log.md",
    "refactor.md",
    "start.md",
    "structure.md",
    "test.md",
    "tokens.md",
  ]);
  for (const filename of commandNames) {
    const commandName = filename.replace(/\.md$/, "");
    const content = await readFile(path.join(packageRoot, "commands", filename), "utf8");
    assert.match(content, new RegExp(`/lg:${commandName}\\b`));
  }
});

test("所有 Skill 和 Subagent 使用统一模板", async () => {
  const requiredSections = ["职责", "输入", "执行流程", "输出", "边界"];
  const skillRoot = path.join(packageRoot, "skills");
  const skillEntries = await readdir(skillRoot, { withFileTypes: true });

  for (const entry of skillEntries.filter((item) => item.isDirectory())) {
    const filename = path.join(skillRoot, entry.name, "SKILL.md");
    const content = await readFile(filename, "utf8");

    assert.match(
      content,
      new RegExp(
        `^---\\nname: ${entry.name}\\ndescription: 在 .+\\nuser-invocable: false\\n---\\n\\n# LetsGo `
      ),
      `${entry.name} 的 frontmatter 或标题不符合统一模板`
    );
    assert.deepEqual(
      [...content.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
      requiredSections,
      `${entry.name} 的章节顺序不符合统一模板`
    );
  }

  const agentRoot = path.join(packageRoot, "agents");
  const agentFiles = (await readdir(agentRoot))
    .filter((name) => name.endsWith(".md"))
    .sort();

  for (const filename of agentFiles) {
    const content = await readFile(path.join(agentRoot, filename), "utf8");

    assert.match(
      content,
      new RegExp(
        `^---\\nname: ${filename.replace(/\.md$/, "")}\\ndescription: .+\\ntools: .+\\ncolor: [a-z]+\\n---\\n\\n# LetsGo `
      ),
      `${filename} 的 frontmatter 或标题不符合统一模板`
    );
    assert.deepEqual(
      [...content.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
      requiredSections,
      `${filename} 的章节顺序不符合统一模板`
    );
    assert.doesNotMatch(content, /\bsubagent\b|子 Agent/);
  }

  const reviewer = await readFile(path.join(agentRoot, "letsgo-reviewer.md"), "utf8");
  assert.match(reviewer, /tools: Read, Glob, Grep, Bash/);
  assert.doesNotMatch(reviewer, /tools: .*Write|tools: .*Edit/);
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
  assert.equal(hooks.hooks.PreToolUse[1].matcher, "Agent");
  assert.match(hooks.hooks.PreToolUse[1].hooks[0].command, /runtime-state\.js/);
  assert.equal(hooks.hooks.PostToolUse[0].matcher, "Skill");
  assert.equal(hooks.hooks.PostToolUseFailure[0].matcher, "Skill");
  assert.match(hooks.hooks.SubagentStart[0].hooks[0].command, /runtime-state\.js/);
  assert.match(hooks.hooks.SubagentStop[0].hooks[0].command, /runtime-state\.js/);
  assert.match(
    hooks.hooks.SessionStart[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/context\.js/
  );
  assert.match(
    hooks.hooks.UserPromptSubmit[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/context\.js/
  );
  assert.match(
    hooks.hooks.Stop[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/token-report\.js/
  );
});

test("cli init 把第一个位置参数当作项目目录", async () => {
  await withTempProject(async (projectDir) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "letsgo"), "init", projectDir],
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
      [path.join(packageRoot, "letsgo"), "init", projectDir],
      { cwd: packageRoot }
    );

    const created = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "letsgo"), "new", "demo-change", "--type", "bugfix", projectDir],
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
      [path.join(packageRoot, "letsgo"), "status", "--change", "demo-change", projectDir],
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
    assert.match(decision.reason, /未选择活跃的 LetsGo 变更/);
  });
});

test("运行时守卫放行未由 LetsGo 管理的项目", async () => {
  await withTempProject(async (projectDir) => {
    assert.equal(await isLetsGoProject(projectDir), false);

    const writeDecision = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(projectDir, "src/app.js"),
        content: "// hi",
      },
    });
    assert.equal(writeDecision.status, "allow");
    assert.match(writeDecision.reason, /未由 LetsGo 管理/);

    const rules = await buildSystemRules({ projectDir });
    assert.equal(rules, "");

    await initProject({ projectDir });
    assert.equal(await isLetsGoProject(projectDir), true);
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
    const missingRuntime = await advanceProject({
      projectDir,
      changeId: "add-login",
      state: "clarify",
    });
    assert.equal(missingRuntime.advanced, false);
    assert.match(missingRuntime.errors.join("\n"), /runtime-state\.json/);
    await markRuntimeStageReady(projectDir, "add-login", "clarify");
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
    await markRuntimeStageReady(projectDir, "add-login", "design");
    await advanceProject({ projectDir, changeId: "add-login", state: "design" });
    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [x] Add failing login test",
      "- [x] Implement login",
      "",
    ].join("\n"));
    await markRuntimeStageReady(projectDir, "add-login", "plan");
    await advanceProject({ projectDir, changeId: "add-login", state: "plan" });

    const applyWrite = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: "mkdir -p src && echo ok > src/app.js",
      },
    });
    assert.equal(applyWrite.status, "allow");

    const tddEvidenceWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(changeDir, "tdd-evidence.md"),
        content: "模式：TDD",
      },
    });
    assert.equal(tddEvidenceWrite.status, "allow");

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
        command: "npm publish",
      },
    });

    assert.equal(decision.status, "ask");
    assert.match(decision.reason, /未看到文件路径/);
  });
});

test("运行时守卫放行常见开发命令和只读 Node 命令", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    for (const command of [
      "npm test",
      "npm run build",
      "node -v",
      "node --help",
      "node --check src/index.js",
      "node --test tests/login.test.js",
      "yarn lint",
    ]) {
      const decision = await decideToolUse({
        projectDir,
        toolName: "Bash",
        toolInput: { command },
      });
      assert.equal(decision.status, "allow", command);
    }
  });
});

test("运行时守卫仅在 apply 和 verify 阶段放行项目内 Node 脚本", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const decideNode = (command) => decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: { command },
    });

    assert.equal((await decideNode("node scripts/build.js")).status, "ask");

    const statusPath = path.join(projectDir, "openspec/changes/add-login/status.json");
    const status = JSON.parse(await readFile(statusPath, "utf8"));
    await writeFile(statusPath, `${JSON.stringify({ ...status, state: "apply" }, null, 2)}\n`);

    assert.equal((await decideNode("node scripts/build.js --target src")).status, "allow");
    assert.equal((await decideNode("node ./tools/check.mjs")).status, "allow");

    for (const command of [
      "node -e \"require('node:fs').writeFileSync('x', 'y')\"",
      "node -p \"process.version\"",
      "node ../outside.js",
      "node /tmp/outside.js",
      "node scripts/build.js && rm -rf dist",
      "node --check src/index.js | tail -1",
    ]) {
      assert.equal((await decideNode(command)).status, "ask", command);
    }

    await writeFile(statusPath, `${JSON.stringify({ ...status, state: "verify" }, null, 2)}\n`);
    assert.equal((await decideNode("node scripts/verify.cjs")).status, "allow");
  });
});

test("运行时守卫允许写入运行问题日志", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const decision = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        file_path: path.join(projectDir, "openspec/.letsgo/issues.md"),
        content: "## 2026-08-08 15:00\n- 测试问题",
      },
    });
    assert.equal(decision.status, "allow");
  });
});

test("运行时守卫放行只读 bash 和 letsgo CLI 命令", async () => {
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
        command: "letsgo validate --before clarify --change add-login",
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

    assert.match(rules, /LetsGo 运行时守卫已启用/);
    assert.match(rules, /当前 LetsGo 变更：add-login，类型：feature，阶段：clarify/);
    assert.match(rules, /add-login：clarify（feature）/);
    assert.match(rules, /规划文档默认使用简体中文/);
    assert.match(rules, /letsgo select <change-id>/);
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

test("TDD 证据强制 RED、GREEN、REFACTOR 顺序并支持非行为豁免", () => {
  const validTdd = [
    "# TDD 证据",
    "模式：TDD",
    "## Cycle 1：登录行为",
    "### RED",
    "- 测试命令：node --test tests/login.test.js",
    "- 结果：失败",
    "### GREEN",
    "- 测试命令：node --test tests/login.test.js",
    "- 结果：通过",
    "### REFACTOR",
    "- 重构：无",
    "- 测试命令：node --test tests/login.test.js",
    "- 结果：通过",
    "",
  ].join("\n");
  assert.deepEqual(validateTddEvidence(validTdd), []);

  const wrongOrder = validTdd
    .replace("### RED", "### TEMP")
    .replace("### GREEN", "### RED")
    .replace("### TEMP", "### GREEN");
  assert.match(validateTddEvidence(wrongOrder).join("\n"), /顺序必须是 RED -> GREEN -> REFACTOR/);

  const exemption = [
    "# TDD 证据",
    "模式：豁免",
    "## 豁免",
    "- 理由：仅修改用户文档，不改变生产行为",
    "- 验证命令：npm test",
    "- 结果：通过",
    "",
  ].join("\n");
  assert.deepEqual(validateTddEvidence(exemption), []);
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
    await markRuntimeStageReady(projectDir, "add-login", "clarify");
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "clarify" })).status.state, "design");

    await writeFile(path.join(changeDir, "design.md"), [
      "# Design",
      "Architecture: Add auth module.",
      "Test Strategy: Unit test login flow.",
      "",
    ].join("\n"));
    await markRuntimeStageReady(projectDir, "add-login", "design");
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "design" })).status.state, "plan");

    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [ ] Add failing login test",
      "- [ ] Implement login",
      "",
    ].join("\n"));
    await markRuntimeStageReady(projectDir, "add-login", "plan");
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "plan" })).status.state, "apply");

    assert.equal((await validateProject({ projectDir, changeId: "add-login", mode: "before", state: "verify" })).ok, false);
    await writeFile(path.join(changeDir, "tasks.md"), [
      "# Tasks",
      "- [x] Add failing login test",
      "- [x] Implement login",
      "",
    ].join("\n"));
    await markRuntimeStageReady(projectDir, "add-login", "apply");
    const missingTdd = await advanceProject({
      projectDir,
      changeId: "add-login",
      state: "apply",
    });
    assert.equal(missingTdd.advanced, false);
    assert.match(missingTdd.errors.join("\n"), /tdd-evidence\.md/);

    await writeFile(path.join(changeDir, "tdd-evidence.md"), [
      "# TDD Evidence",
      "模式：TDD",
      "## Cycle 1：Login behavior",
      "### RED",
      "- 测试命令：node --test tests/login.test.js",
      "- 结果：失败",
      "- 失败原因：Login behavior is missing",
      "### GREEN",
      "- 最小实现：Add login handler",
      "- 测试命令：node --test tests/login.test.js",
      "- 结果：通过",
      "### REFACTOR",
      "- 重构：无",
      "- 测试命令：node --test tests/login.test.js",
      "- 结果：通过",
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
    await markRuntimeStageReady(projectDir, "add-login", "verify");
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "verify" })).status.state, "archive");

    await mkdir(path.join(projectDir, "openspec/archive"), { recursive: true });
    await writeFile(path.join(changeDir, "archive.md"), [
      "# Archive",
      "Summary: Login change archived.",
      "",
    ].join("\n"));
    await markRuntimeStageReady(projectDir, "add-login", "archive");
    const archived = await advanceProject({ projectDir, changeId: "add-login", state: "archive" });
    assert.equal(archived.status.state, "done");
    assert.deepEqual(archived.status.completed, ["clarify", "design", "plan", "apply", "verify", "archive"]);

    const status = await statusProject({ projectDir, changeId: "add-login" });
    assert.equal(status.status.state, "done");
    assert.equal(status.current.label, "已完成");
    assert.equal(status.next, null);
  });
});
