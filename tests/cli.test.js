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
  isAllowedWritePath,
  isLetsGoProject,
  readActiveMarker,
  resolveActiveChange,
  toolPaths,
} from "../lib/guard.js";
import { readRunSummary } from "../lib/run-summary.js";

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
      lastAssistantMessage: `LETGO_RESULT {"stage":"${stage}","role":"writer","status":"ready","filesChanged":["artifact.md"],"evidence":["校验通过"],"risks":[]}`,
    });
  }
  await recordAgentStopped({
    projectDir,
    sessionId,
    changeId,
    stage,
    agentType: REVIEWER,
    lastAssistantMessage: `LETGO_RESULT {"stage":"${stage}","role":"reviewer","status":"pass","blocking":[],"evidence":["审查通过"],"risks":[]}`,
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
    await stat(path.join(projectDir, ".claude/commands/recover.md"));
    await stat(path.join(projectDir, ".claude/commands/continue.md"));
    await stat(path.join(projectDir, ".claude/commands/reopen.md"));
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
    const beforeInit = await doctorProject({
      projectDir,
      checkCodegraph: async () => false,
    });
    assert.equal(beforeInit.installed, false);
    assert.equal(beforeInit.codegraphExecutable, false);
    assert.equal(beforeInit.codegraphIndexed, false);
    assert.equal(beforeInit.codegraphReady, false);

    await initProject({ projectDir });

    const result = await doctorProject({
      projectDir,
      checkCodegraph: async () => false,
    });
    assert.equal(result.installed, true);
    assert.equal(result.commands, true);
    assert.equal(result.skills, true);
    assert.equal(result.openspec, true);
    assert.equal(result.codegraphIndexed, false);

    await mkdir(path.join(projectDir, ".codegraph"));
    await writeFile(path.join(projectDir, ".codegraph/codegraph.db"), "");
    const ready = await doctorProject({
      projectDir,
      checkCodegraph: async () => true,
    });
    assert.equal(ready.codegraphExecutable, true);
    assert.equal(ready.codegraphIndexed, true);
    assert.equal(ready.codegraphReady, true);
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

  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  );
  assert.equal(packageJson.bin.letsgo, "./bin/letsgo");
  assert.equal(packageJson.files.includes("bin"), true);
  const bundledCli = await stat(path.join(packageRoot, "bin/letsgo"));
  assert.notEqual(bundledCli.mode & 0o111, 0, "插件内置 CLI 必须可执行");
  const { stdout: bundledHelp } = await execFileAsync(
    path.join(packageRoot, "bin/letsgo"),
    ["--help"]
  );
  assert.match(bundledHelp, /letsgo continue/);

  const mcp = JSON.parse(
    await readFile(path.join(packageRoot, ".mcp.json"), "utf8")
  );
  assert.deepEqual(mcp.mcpServers.codegraph, {
    type: "stdio",
    command: "codegraph",
    args: ["serve", "--mcp"],
  });

  const commandNames = (await readdir(path.join(packageRoot, "commands")))
    .filter((name) => name.endsWith(".md"))
    .sort();
  assert.deepEqual(commandNames, [
    "bugfix.md",
    "check.md",
    "continue.md",
    "letsgo.md",
    "log.md",
    "recover.md",
    "refactor.md",
    "reopen.md",
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

  for (const filename of ["start.md", "bugfix.md", "refactor.md", "test.md", "letsgo.md"]) {
    const content = await readFile(path.join(packageRoot, "commands", filename), "utf8");
    assert.match(content, /未验证验收项：0/, `${filename} 必须阻止未完成验收`);
    assert.match(content, /最多再派发一次|初审一次、修订后复审一次/, `${filename} 必须限制 reviewer`);
    assert.match(content, /默认.*git add|默认.*本地.*commit/s, `${filename} 必须默认本地提交`);
    assert.match(content, /不超过 12 行/, `${filename} 必须限制最终汇总`);
  }

  const typedEntries = new Map([
    ["start.md", "feature"],
    ["bugfix.md", "bugfix"],
    ["refactor.md", "refactor"],
    ["test.md", "test"],
  ]);
  for (const [filename, type] of typedEntries) {
    const content = await readFile(path.join(packageRoot, "commands", filename), "utf8");
    assert.match(content, /letsgo doctor/, `${filename} 必须先做环境检查`);
    assert.match(content, /codegraphReady/, `${filename} 必须检查 CodeGraph 状态`);
    assert.match(content, /npm install -g @colbymchenry\/codegraph/);
    assert.match(content, /codegraph init/);
    assert.match(content, /\$ARGUMENTS.*为空/s, `${filename} 必须补问缺失需求`);
    assert.match(content, /确认.*工作流/s, `${filename} 必须确认工作流`);
    assert.match(content, new RegExp(`letsgo new <change-id> --type ${type}`));
    assert.match(content, /letsgo select <change-id>/);
    assert.match(content, /letsgo status --change <change-id>/);
    for (const label of ["变更位置", "工作流", "当前状态", "下一步"]) {
      assert.match(content, new RegExp(label), `${filename} 启动摘要缺少 ${label}`);
    }
  }
});

test("CodeGraph 以图谱优先且可降级的方式接入 clarify", async () => {
  const clarify = await readFile(
    path.join(packageRoot, "skills/letsgo-clarify/SKILL.md"),
    "utf8"
  );
  const projectRules = await readFile(
    path.join(packageRoot, "templates/CLAUDE.md"),
    "utf8"
  );

  assert.match(clarify, /codegraph_explore/);
  assert.match(clarify, /不得调用第三次/);
  assert.match(clarify, /Grep.*Read/);
  assert.match(projectRules, /codegraph init/);
  assert.match(projectRules, /\.codegraph\//);
  assert.match(projectRules, /不要提交/);
});

test("设计决策文档记录关键门禁的理由与调整条件", async () => {
  const decisions = await readFile(
    path.join(packageRoot, "docs/design-decisions.md"),
    "utf8"
  );
  const readme = await readFile(path.join(packageRoot, "README.md"), "utf8");

  for (const topic of [
    "CodeGraph 为什么最多两次",
    "为什么不增加监督 Subagent",
    "Reviewer 为什么最多两轮",
    "为什么 Apply 必须真实 TDD",
    "为什么 Verify 必须零未验收项",
    "为什么默认本地提交但不自动推送",
    "为什么阻塞后必须显式 Reopen",
    "为什么 Apply 按任务检查点续跑",
  ]) {
    assert.match(decisions, new RegExp(topic));
  }
  assert.match(decisions, /调整条件/);
  assert.match(readme, /docs\/design-decisions\.md/);
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
    assert.doesNotMatch(
      content.match(/^tools: .+$/m)?.[0] ?? "",
      /\b(?:Agent|Task)\b/,
      `${filename} 不得拥有二次派发 Subagent 的工具`
    );
    assert.match(content, /简体中文/);
    assert.match(content, /filesChanged|blocking/);
    assert.match(content, /evidence/);
    assert.match(content, /risks/);
    assert.match(
      content,
      /不直接询问用户[^\n]*阻塞问题[^\n]*主 Agent/,
      `${filename} 必须把需要用户决定的问题交回主 Agent`
    );
  }

  const reviewer = await readFile(path.join(agentRoot, "letsgo-reviewer.md"), "utf8");
  assert.match(reviewer, /tools: Read, Glob, Grep, Bash/);
  assert.doesNotMatch(reviewer, /tools: .*Write|tools: .*Edit/);
  assert.match(reviewer, /最终对话响应/);
  assert.match(reviewer, /不得.*Write|禁止.*Write/);
});

test("所有阶段 Skill 只派发当前阶段的完整规范 Agent 名", async () => {
  const skillFiles = {
    clarify: "letsgo-clarify",
    design: "letsgo-design",
    plan: "letsgo-plan",
    apply: "letsgo-apply",
    verify: "letsgo-verify",
    archive: "letsgo-archive",
  };
  const allAllowed = new Set([...Object.values(STAGE_WRITERS), REVIEWER]);

  for (const [stage, skillName] of Object.entries(skillFiles)) {
    const content = await readFile(
      path.join(packageRoot, "skills", skillName, "SKILL.md"),
      "utf8"
    );
    const dispatched = [...content.matchAll(/@(lg:[a-z0-9-]+)/g)].map(
      (match) => match[1]
    );
    const expected = [STAGE_WRITERS[stage], REVIEWER].filter(Boolean);

    assert.deepEqual(
      [...new Set(dispatched)].sort(),
      expected.sort(),
      `${stage} 只能派发当前阶段 Writer 和统一 Reviewer`
    );
    for (const name of dispatched) {
      assert.equal(allAllowed.has(name), true, `${name} 必须对应 agents/*.md`);
    }
  }
});

test("apply 在全部任务完成前持续续派 writer 且不得进入 reviewer", async () => {
  const applySkill = await readFile(
    path.join(packageRoot, "skills/letsgo-apply/SKILL.md"),
    "utf8"
  );
  const applyWriter = await readFile(
    path.join(packageRoot, "agents/letsgo-apply-writer.md"),
    "utf8"
  );

  assert.match(applySkill, /超时|截断/);
  assert.match(applySkill, /重新派发|续派/);
  assert.match(applySkill, /未完成任务[：:]\s*0/);
  assert.match(applySkill, /不得.*reviewer|不.*进入.*reviewer/);
  assert.match(applyWriter, /"status":"partial"/);
  assert.match(applyWriter, /remainingTasks/);
  assert.match(applyWriter, /validate --after apply[\s\S]{0,180}ready/);
});

test("有限选择使用 AskUserQuestion，自由文本才允许普通输入", async () => {
  const clarify = await readFile(
    path.join(packageRoot, "skills/letsgo-clarify/SKILL.md"),
    "utf8"
  );
  const workflow = await readFile(
    path.join(packageRoot, "skills/letsgo-workflow/SKILL.md"),
    "utf8"
  );
  const projectRules = await readFile(path.join(packageRoot, "templates/CLAUDE.md"), "utf8");

  for (const content of [clarify, workflow, projectRules]) {
    assert.match(content, /有限选项[\s\S]{0,100}AskUserQuestion/);
    assert.match(content, /自由文本/);
    assert.match(content, /Subagent[\s\S]{0,150}不直接询问用户[\s\S]{0,150}主 Agent/);
  }
});

test("阶段推进必须确认 advanced 与下一状态后才能创建后续产物", async () => {
  const files = [
    "commands/letsgo.md",
    "commands/start.md",
    "commands/bugfix.md",
    "commands/refactor.md",
    "commands/test.md",
    "skills/letsgo-workflow/SKILL.md",
    "templates/CLAUDE.md",
  ];

  for (const filename of files) {
    const content = await readFile(path.join(packageRoot, filename), "utf8");
    assert.match(content, /advanced.*true/si, `${filename} 必须检查 advance 成功标记`);
    assert.match(content, /letsgo status/si, `${filename} 必须重新读取状态`);
    assert.match(
      content,
      /不(?:得|可).*后续阶段|禁止.*后续阶段/si,
      `${filename} 必须禁止失败后创建未来阶段产物`
    );
  }
});

test("两轮审查阻塞后禁止手动批准并允许审计式重开", async () => {
  const clarify = await readFile(
    path.join(packageRoot, "skills/letsgo-clarify/SKILL.md"),
    "utf8"
  );
  const workflow = await readFile(
    path.join(packageRoot, "skills/letsgo-workflow/SKILL.md"),
    "utf8"
  );
  const reopen = await readFile(path.join(packageRoot, "commands/reopen.md"), "utf8");

  for (const content of [clarify, workflow, reopen]) {
    assert.match(content, /不得.*手动批准|禁止手动批准/);
    assert.match(content, /第二轮[\s\S]{0,100}blocking|blocking[\s\S]{0,100}第二轮/);
    assert.match(content, /重开当前[\s\S]{0,50}审查周期|重开当前阶段/);
  }
  assert.match(clarify, /clarify[\s\S]{0,30}没有更早阶段/);
});

test("hooks.json 正确接线 PreToolUse、SessionStart 和 UserPromptSubmit", async () => {
  const hooks = JSON.parse(
    await readFile(path.join(packageRoot, "hooks/hooks.json"), "utf8")
  );

  assert.match(hooks.hooks.PreToolUse[0].matcher, /Bash\|Write\|Edit\|MultiEdit\|NotebookEdit/);
  assert.match(
    hooks.hooks.PreToolUse[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT:-\$\{CODEAGENT3_PLUGIN_ROOT\}\}\/scripts\/guard\.js/
  );
  assert.equal(hooks.hooks.PreToolUse[1].matcher, "Agent|Task");
  assert.match(hooks.hooks.PreToolUse[1].hooks[0].command, /runtime-state\.js/);
  assert.equal(
    hooks.hooks.PreToolUse[2].matcher,
    "mcp__plugin_lg_codegraph__codegraph_explore"
  );
  assert.match(hooks.hooks.PreToolUse[2].hooks[0].command, /guard\.js/);
  assert.equal(hooks.hooks.PostToolUse[0].matcher, "Skill");
  assert.equal(hooks.hooks.PostToolUse[1].matcher, "Agent|Task");
  assert.match(hooks.hooks.PostToolUse[1].hooks[0].command, /runtime-state\.js/);
  assert.equal(hooks.hooks.PostToolUseFailure[0].matcher, "Skill");
  assert.match(hooks.hooks.SubagentStart[0].hooks[0].command, /runtime-state\.js/);
  assert.match(hooks.hooks.SubagentStop[0].hooks[0].command, /runtime-state\.js/);
  assert.match(
    hooks.hooks.SessionStart[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT:-\$\{CODEAGENT3_PLUGIN_ROOT\}\}\/scripts\/context\.js/
  );
  assert.match(
    hooks.hooks.UserPromptSubmit[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT:-\$\{CODEAGENT3_PLUGIN_ROOT\}\}\/scripts\/context\.js/
  );
  assert.match(
    hooks.hooks.Stop[0].hooks[0].command,
    /\$\{CLAUDE_PLUGIN_ROOT:-\$\{CODEAGENT3_PLUGIN_ROOT\}\}\/scripts\/token-report\.js/
  );
  assert.match(hooks.hooks.PermissionRequest[0].hooks[0].command, /metrics\.js/);
  assert.match(hooks.hooks.PermissionDenied[0].hooks[0].command, /metrics\.js/);
  assert.match(hooks.hooks.PreCompact[0].hooks[0].command, /metrics\.js/);
  assert.match(hooks.hooks.PostCompact[0].hooks[0].command, /metrics\.js/);

  for (const registrations of Object.values(hooks.hooks)) {
    for (const registration of registrations) {
      for (const hook of registration.hooks) {
        assert.match(
          hook.command,
          /^node "\$\{CLAUDE_PLUGIN_ROOT:-\$\{CODEAGENT3_PLUGIN_ROOT\}\}\/scripts\/[^"]+\.js"$/,
          `Hook 入口必须引用完整插件路径，兼容含空格的安装目录：${hook.command}`
        );
      }
    }
  }
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

    const codeAgent3ClarifyWrite = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        filePath: path.join(changeDir, "proposal.md"),
        content: "# Proposal",
      },
    });
    assert.equal(codeAgent3ClarifyWrite.status, "allow");

    const codeAgent3ChangeDirectory = await decideToolUse({
      projectDir,
      toolName: "ExternalDirectory",
      toolInput: { directoryPath: changeDir },
    });
    assert.equal(codeAgent3ChangeDirectory.status, "allow");

    const unrelatedDirectory = await decideToolUse({
      projectDir,
      toolName: "ExternalDirectory",
      toolInput: {
        directoryPath: path.join(projectDir, "openspec/changes/another-change"),
      },
    });
    assert.equal(unrelatedDirectory.status, "deny");

    const codeAgent3SkippedWrite = await decideToolUse({
      projectDir,
      toolName: "Edit",
      toolInput: {
        filePath: path.join(changeDir, "design.md"),
        oldString: "x",
        newString: "y",
      },
    });
    assert.equal(codeAgent3SkippedWrite.status, "deny");
    assert.match(codeAgent3SkippedWrite.reason, /design\.md/);

    const prematureVerification = await decideToolUse({
      projectDir,
      toolName: "Write",
      toolInput: {
        filePath: path.join(changeDir, "verification.md"),
        content: "# Verification",
      },
    });
    assert.equal(prematureVerification.status, "deny");
    assert.match(prematureVerification.reason, /verify 阶段/);
    assert.match(prematureVerification.reason, /advance.*status/);
    assert.match(
      prematureVerification.reason,
      /openspec\/changes\/add-login\/proposal\.md/
    );

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

test("Windows 路径规范化后 clarify 仍允许根目录 proposal.md", () => {
  const context = {
    changeId: "doc-element-service",
    state: "clarify",
    type: "feature",
  };
  const projectDir = "D:\\test";

  for (const target of [
    "D:\\test\\openspec\\changes\\doc-element-service\\proposal.md",
    "d:\\TEST\\openspec\\changes\\doc-element-service\\proposal.md",
    "D:/test/openspec/changes/doc-element-service/proposal.md",
  ]) {
    assert.equal(isAllowedWritePath(projectDir, target, context), true, target);
  }
  assert.equal(
    isAllowedWritePath(
      projectDir,
      "D:\\test\\openspec\\changes\\doc-element-service\\verification.md",
      context
    ),
    false
  );
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

test("运行时守卫识别 Bash 中带空格的引号路径", async () => {
  await withTempProject(async (tempDir) => {
    const projectDir = path.join(tempDir, "project with space");
    await mkdir(projectDir, { recursive: true });
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "add-login" });

    const proposalPath = path.join(
      projectDir,
      "openspec",
      "changes",
      "add-login",
      "proposal.md"
    );
    const decision = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: `touch "${proposalPath}"`,
      },
    });

    assert.equal(decision.status, "allow", decision.reason);
  });
});

test("toolPaths 识别 Windows 引号路径、反斜杠相对路径和带空格目录", () => {
  const projectDir = "D:\\Work Space\\buck";
  const expected = "d:/work space/buck/openspec/changes/add-login/proposal.md";

  for (const command of [
    'type nul > "D:\\Work Space\\buck\\openspec\\changes\\add-login\\proposal.md"',
    'type nul > "openspec\\changes\\add-login\\proposal.md"',
  ]) {
    const paths = toolPaths(projectDir, { command });
    assert.equal(paths.length, 1, command);
    assert.equal(paths[0].replaceAll("\\", "/").toLowerCase(), expected, command);
  }
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

    for (const command of [
      "sed -n '95,115p' src/server/index.js",
      "sed -n '1,$p' README.md",
      "rg -n clear src test",
      "ls -la openspec/changes",
      "pwd",
      "git status",
      "git diff --stat",
      "git show --stat HEAD",
      "git log -5 --oneline",
    ]) {
      const readOnly = await decideToolUse({
        projectDir,
        toolName: "Bash",
        toolInput: { command },
      });
      assert.equal(readOnly.status, "allow", command);
    }

    for (const command of [
      "sed -i '' 's/old/new/' src/server/index.js",
      "sed -n '1,3w output.txt' src/server/index.js",
      "sed -n '1,3p' src/server/index.js > output.txt",
    ]) {
      const writeCapable = await decideToolUse({
        projectDir,
        toolName: "Bash",
        toolInput: { command },
      });
      assert.notEqual(writeCapable.status, "allow", command);
    }

    const cliCommand = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: {
        command: "letsgo validate --before clarify --change add-login",
      },
    });
    assert.equal(cliCommand.status, "allow");

    for (const command of [
      "letsgo status --change add-login 2>&1",
      "letsgo status --change add-login 2>/dev/null",
    ]) {
      const diagnosticRedirect = await decideToolUse({
        projectDir,
        toolName: "Bash",
        toolInput: { command },
      });
      assert.equal(diagnosticRedirect.status, "allow", command);
    }

    const fileRedirect = await decideToolUse({
      projectDir,
      toolName: "Bash",
      toolInput: { command: "letsgo status --change add-login > status.txt" },
    });
    assert.notEqual(fileRedirect.status, "allow");

    for (const command of [
      'node "C:/Program Files/letsgo/letsgo" advance clarify --change add-login',
      '"C:/Program Files/letsgo/letsgo.cmd" advance clarify --change add-login',
    ]) {
      const wrappedCli = await decideToolUse({
        projectDir,
        toolName: "Bash",
        toolInput: { command },
      });
      assert.equal(wrappedCli.status, "allow", command);
    }
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

test("创建变更不会覆盖缺少 status.json 的已有目录", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    const partialDir = path.join(projectDir, "openspec/changes/partial-change");
    const notePath = path.join(partialDir, "manual-note.md");
    await mkdir(partialDir, { recursive: true });
    await writeFile(notePath, "keep me\n");

    await assert.rejects(
      newChangeProject({ projectDir, changeId: "partial-change" }),
      /已存在但缺少 status\.json/
    );
    assert.equal(await readFile(notePath, "utf8"), "keep me\n");
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
    await markRuntimeStageReady(projectDir, "add-login", "apply");
    assert.equal((await advanceProject({ projectDir, changeId: "add-login", state: "apply" })).status.state, "verify");

    await writeFile(path.join(changeDir, "verification.md"), [
      "# Verification",
      "Status: Pass",
      "Unverified Acceptance Criteria: 0",
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
    assert.equal(await readActiveMarker(projectDir), null);

    const runSummary = await readRunSummary(projectDir);
    assert.equal(runSummary.status, "completed");
    assert.equal(runSummary.currentStage, null);
    assert.deepEqual(
      runSummary.stages.map(({ stage, status: stageStatus }) => [stage, stageStatus]),
      [
        ["clarify", "completed"],
        ["design", "completed"],
        ["plan", "completed"],
        ["apply", "completed"],
        ["verify", "completed"],
        ["archive", "completed"],
      ]
    );
  });
});

test("verify 有待手动验收项时不得推进 archive", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });
    await newChangeProject({ projectDir, changeId: "manual-pending" });
    const statusPath = path.join(projectDir, "openspec/changes/manual-pending/status.json");
    const status = JSON.parse(await readFile(statusPath, "utf8"));
    await writeFile(
      statusPath,
      `${JSON.stringify({
        ...status,
        state: "verify",
        completed: ["clarify", "design", "plan", "apply"],
        approved: { clarify: true, design: true, plan: true, apply: true },
      }, null, 2)}\n`
    );
    const changeDir = path.dirname(statusPath);
    await writeFile(path.join(changeDir, "proposal.md"), [
      "# Proposal",
      "Why: Need manual acceptance.",
      "What Changes: Add browser behavior.",
      "Acceptance Criteria: Browser flow works.",
      "",
    ].join("\n"));
    await writeFile(path.join(changeDir, "design.md"), [
      "# Design",
      "Architecture: Browser interaction.",
      "Test Strategy: Run browser acceptance.",
      "",
    ].join("\n"));
    await writeFile(path.join(changeDir, "tasks.md"), "# Tasks\n- [x] 实现\n");
    await writeFile(path.join(changeDir, "tdd-evidence.md"), [
      "# TDD 证据",
      "模式：TDD",
      "## Cycle 1：行为",
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
      "",
    ].join("\n"));
    await writeFile(path.join(changeDir, "verification.md"), [
      "# Verification",
      "状态：通过",
      "未验证验收项：8",
      "验收标准 1-8 需浏览器手动验证。",
      "",
    ].join("\n"));

    const result = await validateProject({
      projectDir,
      changeId: "manual-pending",
      mode: "after",
      state: "verify",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /未验证验收项|手动验证/);
  });
});
