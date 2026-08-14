import { access, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { STATE_FILES, STATE_LABELS, STATES } from "../state/states.js";
import { buildRecoveryContext, readRunSummary } from "./run-summary.js";

export const ACTIVE_MARKER_RELATIVE = path.posix.join("openspec", ".letsgo", "active.json");

const READ_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "webfetch",
  "websearch",
  "lsp",
  "todowrite",
]);

export async function buildSystemRules({ projectDir }) {
  if (!(await isLetsGoProject(projectDir))) {
    return "";
  }

  const active = await activeChanges(projectDir);
  const selected = await resolveActiveChange(projectDir, active);
  const activeSummary =
    active.length === 0
      ? "未找到活跃的 LetsGo 变更。"
      : active.map((change) => `- ${change.id}：${change.state}（${change.type}）`).join("\n");

  const recovery = await buildRecoveryContext({ projectDir });
  return [
    "LetsGo 运行时守卫已启用。",
    "生命周期：clarify -> design -> plan -> apply -> verify -> archive -> done。",
    selectedLineOf(selected),
    "活跃变更：",
    activeSummary,
    "每阶段：先 `letsgo validate --before <state>`，完成后 `letsgo validate --after <state>` 再 `letsgo advance <state>`。",
    "多变更时用 `letsgo select <change-id>` 选择当前变更。",
    "只允许在当前阶段的写入范围内写文件；规划文档默认使用简体中文。",
    recovery,
  ].filter(Boolean).join("\n");
}

export async function buildActiveContext({ projectDir }) {
  if (!(await isLetsGoProject(projectDir))) {
    return "";
  }

  const active = await activeChanges(projectDir);
  const selected = await resolveActiveChange(projectDir, active);
  const recovery = await buildRecoveryContext({ projectDir });
  return [selectedLineOf(selected), recovery].filter(Boolean).join("\n");
}

export async function decideToolUse({ projectDir, toolName = "", toolInput = {} }) {
  const kind = String(toolName ?? "").toLowerCase();

  if (!(await isLetsGoProject(projectDir))) {
    return allow("项目未由 LetsGo 管理");
  }

  if (isCodeGraphExploreTool(kind)) {
    const active = await activeChanges(projectDir);
    const context = await resolveActiveChange(projectDir, active);
    const summary = await readRunSummary(projectDir);
    const used = summary?.changeId === context?.changeId
      ? Number(summary?.metrics?.codeGraphQueries ?? 0)
      : 0;
    if (context && used >= 2) {
      return deny("CodeGraph 每个变更最多调用 2 次；第三次查询已阻止，请使用已有结果或降级 Read/Grep");
    }
    return allow(`CodeGraph 聚焦查询 ${used + 1}/2`);
  }

  if (READ_TOOLS.has(kind)) {
    return allow("只读工具");
  }

  const command = String(toolInput?.command ?? toolInput?.cmd ?? "");
  if (isLetsGoCommand(command)) {
    return allow("LetsGo CLI 命令");
  }

  if (isAllowedBashCommand(command)) {
    return allow("常见开发命令");
  }

  if (!isWriteTool(kind, command)) {
    return allow("非写入工具");
  }

  const active = await activeChanges(projectDir);
  const lifecycleCompleted = active.length === 0 && (await hasCompletedLifecycle(projectDir));

  if (lifecycleCompleted && isSafeLocalGitDelivery(command)) {
    return allow("生命周期完成后的本地 Git 交付命令");
  }

  if (lifecycleCompleted && isIssuesWrite(kind, projectDir, toolInput)) {
    return allow("生命周期完成后的 LetsGo 问题记录");
  }

  if (isGitPushCommand(command)) {
    return {
      status: "ask",
      reason: "Git push 会修改远端，需要用户明确批准",
    };
  }

  const context = await resolveActiveChange(projectDir, active);
  if (!context) {
    return deny("写入被阻止：未选择活跃的 LetsGo 变更。不要重复同一操作或改用其他工具绕过；先运行 `letsgo recover` 或选择有效变更");
  }

  if (isProjectNodeScriptCommand(command, context.state)) {
    return allow(`允许执行项目内 Node 脚本：${context.state} 阶段`);
  }

  if (isNodeCommand(command)) {
    return {
      status: "ask",
      reason: `Node 命令需要审查：${context.state} 阶段只自动放行只读命令和项目内相对路径脚本`,
    };
  }

  const paths = toolPaths(projectDir, toolInput);
  if (paths.length === 0) {
    return {
      status: "ask",
      reason: `写入需要审查：在 ${context.changeId} 的 ${context.state} 阶段未看到文件路径`,
    };
  }

  const denied = paths.filter((target) => !isAllowedWritePath(projectDir, target, context));
  if (denied.length > 0) {
    const futureStageHint = denied
      .map((target) => stageForChangeArtifact(projectDir, target, context))
      .find(Boolean);
    return deny(
      `写入被阻止（${context.state} 阶段）：${denied
        .map((target) => relativePath(projectDir, target))
        .join(", ")}。当前阶段主产物是 ${path.posix.join("openspec", "changes", context.changeId, STATE_FILES[context.state])}。${futureStageHint
        ? `该产物属于 ${futureStageHint} 阶段；请检查 letsgo advance 的 advanced: true，并用 letsgo status 确认状态后再继续。`
        : ""}不要重复同一操作或改用 Bash/临时脚本绕过；记录问题并停止`
    );
  }

  return allow(`允许写入：${context.changeId} 的 ${context.state} 阶段`);
}

function stageForChangeArtifact(projectDir, targetPath, context) {
  const relative = relativePath(projectDir, targetPath);
  const changeBase = path.posix.join("openspec", "changes", context.changeId);
  for (const [stage, filename] of Object.entries(STATE_FILES)) {
    if (relative === path.posix.join(changeBase, filename) && stage !== context.state) {
      return stage;
    }
  }
  return null;
}

export function isCodeGraphExploreTool(toolName) {
  return String(toolName ?? "").toLowerCase().endsWith("codegraph_explore");
}

export function isAllowedWritePath(projectDir, targetPath, context) {
  const relative = relativePath(projectDir, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const changeBase = path.posix.join("openspec", "changes", context.changeId);
  const stateFile = path.posix.join(changeBase, STATE_FILES[context.state]);
  const tddEvidenceFile = path.posix.join(changeBase, "tdd-evidence.md");
  const statusFile = path.posix.join(changeBase, "status.json");
  const issuesFile = path.posix.join("openspec", ".letsgo", "issues.md");

  if (
    relative === changeBase ||
    relative === statusFile ||
    relative === stateFile ||
    (context.state === "apply" && relative === tddEvidenceFile)
  ) {
    return true;
  }

  if (relative === issuesFile) {
    return true;
  }

  if (["design", "plan"].includes(context.state)) {
    return relative.startsWith(path.posix.join(changeBase, "specs") + "/");
  }

  if (context.state === "apply") {
    return !relative.startsWith("openspec/");
  }

  if (context.state === "archive") {
    return (
      relative === path.posix.join(changeBase, "archive.md") ||
      relative.startsWith(path.posix.join("openspec", "archive", context.changeId) + "/") ||
      relative.startsWith(path.posix.join("openspec", "specs") + "/")
    );
  }

  return false;
}

export function toolPaths(projectDir, toolInput = {}) {
  const raw = new Set();

  for (const key of [
    "file_path",
    "filePath",
    "notebook_path",
    "notebookPath",
    "directory_path",
    "directoryPath",
    "path",
  ]) {
    if (typeof toolInput[key] === "string" && toolInput[key].trim()) {
      raw.add(toolInput[key].trim());
    }
  }

  if (typeof toolInput.command === "string") {
    for (const token of tokenizeShellCommand(toolInput.command)) {
      const cleaned = cleanToken(token);
      if (!cleaned) {
        continue;
      }
      if (isAbsoluteToolPath(cleaned) || looksLikeRelativeFilePath(cleaned)) {
        raw.add(cleaned);
      }
    }
  }

  return [...new Set(raw)].map((value) => resolveToolPath(projectDir, value));
}

export async function activeChanges(projectDir) {
  const changesDir = path.join(projectDir, "openspec", "changes");
  let entries = [];
  try {
    entries = await readdir(changesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const changes = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const raw = await readFile(path.join(changesDir, entry.name, "status.json"), "utf8");
      const status = JSON.parse(raw);
      if (STATES.includes(status.state)) {
        changes.push({ id: status.id ?? entry.name, state: status.state, type: status.type ?? "unknown" });
      }
    } catch {
      // 忽略损坏或不完整的变更；validate 稍后会报告。
    }
  }

  return changes;
}

async function hasCompletedLifecycle(projectDir) {
  const changesDir = path.join(projectDir, "openspec", "changes");
  let entries = [];
  try {
    entries = await readdir(changesDir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const raw = await readFile(path.join(changesDir, entry.name, "status.json"), "utf8");
      const status = JSON.parse(raw);
      const completed = Array.isArray(status.completed) ? status.completed : [];
      if (
        status.state === "done" &&
        STATES.every((state) => completed.includes(state) && status.approved?.[state] === true)
      ) {
        return true;
      }
    } catch {
      // 损坏或不完整的状态不能授权生命周期完成后的写入。
    }
  }

  return false;
}

export async function resolveActiveChange(projectDir, active = null) {
  if (active === null) {
    active = await activeChanges(projectDir);
  }

  const markerChangeId = await readActiveMarker(projectDir);
  const marked = markerChangeId
    ? active.find((change) => change.id === markerChangeId)
    : undefined;
  if (marked) {
    return {
      changeId: marked.id,
      state: marked.state,
      type: marked.type,
    };
  }

  if (active.length === 1) {
    return {
      changeId: active[0].id,
      state: active[0].state,
      type: active[0].type,
    };
  }

  return null;
}

export async function readActiveMarker(projectDir) {
  try {
    const raw = await readFile(path.join(projectDir, ACTIVE_MARKER_RELATIVE), "utf8");
    const marker = JSON.parse(raw);
    return typeof marker?.changeId === "string" && marker.changeId ? marker.changeId : null;
  } catch {
    return null;
  }
}

export async function clearActiveMarker(projectDir) {
  await unlink(path.join(projectDir, ACTIVE_MARKER_RELATIVE)).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
}

export async function isLetsGoProject(projectDir) {
  try {
    await access(path.join(projectDir, "openspec"));
    return true;
  } catch {
    return false;
  }
}

function isLetsGoCommand(command) {
  const trimmed = stripSafeDiagnosticRedirects(command);
  if (hasShellControlOperators(trimmed)) {
    return false;
  }
  return (
    /^letsgo(?:\s|$)/.test(trimmed) ||
    /^node\s+(?:"[^"]*[\\/]letsgo"|'[^']*[\\/]letsgo'|\S*[\\/]letsgo)(?:\s|$)/.test(trimmed) ||
    /^(?:"[^"]*[\\/]letsgo\.cmd"|'[^']*[\\/]letsgo\.cmd'|\S*[\\/]letsgo\.cmd)(?:\s|$)/.test(trimmed)
  );
}

function isAllowedBashCommand(command) {
  const trimmed = stripSafeDiagnosticRedirects(command);
  return (
    /\b(npm|pnpm|yarn)\s+(test|run|lint|build|exec|--version|install)\b/.test(trimmed) ||
    isReadOnlySedCommand(trimmed) ||
    isReadOnlyNodeCommand(trimmed)
  );
}

function isReadOnlySedCommand(command) {
  if (hasShellControlOperators(command)) {
    return false;
  }

  const match = command.match(
    /^sed\s+-n\s+(['"]?)(?:\d+|\$)(?:,(?:\d+|\$))?p\1\s+(.+)$/
  );
  if (!match) {
    return false;
  }

  const args = tokenize(match[2]);
  if (args[0] === "--") {
    args.shift();
  }
  return args.length > 0 && args.every((arg) => !arg.startsWith("-"));
}

function isReadOnlyNodeCommand(command) {
  if (hasShellControlOperators(command)) {
    return false;
  }

  return (
    /^node\s+(?:-v|--version|-h|--help)\s*$/.test(command) ||
    /^node\s+--check\s+\S+(?:\s+\S+)*\s*$/.test(command) ||
    /^node\s+--test(?:\s+\S+(?:\s+\S+)*)?\s*$/.test(command)
  );
}

function isProjectNodeScriptCommand(command, state) {
  if (!["apply", "verify"].includes(state)) {
    return false;
  }

  const trimmed = String(command ?? "").trim();
  if (hasShellControlOperators(trimmed)) {
    return false;
  }

  const match = trimmed.match(
    /^node\s+((?:\.\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:js|cjs|mjs))(?:\s|$)/
  );
  if (!match) {
    return false;
  }

  const scriptPath = path.posix.normalize(match[1].replace(/\\/g, "/"));
  return (
    !path.posix.isAbsolute(scriptPath) &&
    !scriptPath.startsWith("~") &&
    !scriptPath.split("/").includes("..")
  );
}

function isNodeCommand(command) {
  return /^node(?:\s|$)/.test(String(command ?? "").trim());
}

function isSafeLocalGitDelivery(command) {
  const trimmed = normalizeSafeCommitMessage(String(command ?? "").trim());
  const steps = splitSafeGitDeliveryChain(trimmed);
  if (steps === null || steps.length === 0 || steps.length > 3) {
    return false;
  }

  const sequence = steps.map((step) => {
    if (isSafeGitAdd(step)) return "add";
    if (isSafeGitCommit(step)) return "commit";
    if (isSafeGitInspection(step)) return "inspect";
    return "unsafe";
  }).join(",");
  return new Set([
    "add",
    "commit",
    "add,commit",
    "add,inspect",
    "commit,inspect",
    "add,commit,inspect",
  ]).has(sequence);
}

function normalizeSafeCommitMessage(command) {
  return command.replace(
    /git\s+commit\s+-m\s+"\$\(cat\s+<<'([A-Za-z_][A-Za-z0-9_]*)'\n([^\0]*?)\n\1\n\)"/g,
    "git commit -m 'LETGO_SAFE_MULTILINE_MESSAGE'"
  );
}

function isSafeGitCommit(command) {
  if (!/^git\s+commit(?:\s|$)/.test(command)) {
    return false;
  }
  return !/--(?:amend|fixup|squash)(?:=|\s|$)/.test(command);
}

function isSafeGitAdd(command) {
  if (!/^git\s+add(?:\s|$)/.test(command)) {
    return false;
  }
  const args = tokenize(command).slice(2);
  return args.every(
    (arg) =>
      arg === "--" ||
      ["-A", "--all", "-u", "--update"].includes(arg) ||
      (!path.isAbsolute(arg) && !arg.split(/[\\/]/).includes(".."))
  );
}

function isSafeGitInspection(command) {
  return (
    /^git\s+diff\s+--cached(?:\s+--stat)?$/.test(command) ||
    /^git\s+show(?:\s+--stat)?$/.test(command) ||
    /^git\s+status(?:\s+(?:--short|--porcelain(?:=v[12])?))*$/.test(command)
  );
}

function splitSafeGitDeliveryChain(command) {
  if (!command || /[`<>;|\r\n]|\$\(/.test(command)) {
    return null;
  }

  const steps = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "&") {
      if (command[index + 1] !== "&" || !current.trim()) {
        return null;
      }
      steps.push(current.trim());
      current = "";
      index += 1;
      continue;
    }
    current += char;
  }

  if (quote || escaped || !current.trim()) {
    return null;
  }
  steps.push(current.trim());
  return steps;
}

function isIssuesWrite(kind, projectDir, toolInput) {
  if (!/(write|edit|multiedit|notebookedit)/.test(kind)) {
    return false;
  }
  const paths = toolPaths(projectDir, toolInput);
  return (
    paths.length === 1 &&
    relativePath(projectDir, paths[0]) === path.posix.join("openspec", ".letsgo", "issues.md")
  );
}

function isGitPushCommand(command) {
  const trimmed = String(command ?? "").trim();
  return !hasShellControlOperators(trimmed) && /^git\s+push(?:\s|$)/.test(trimmed);
}

function hasShellControlOperators(command) {
  return /[;&|<>`]|\$\(/.test(String(command ?? ""));
}

function selectedLineOf(selected) {
  return selected
    ? `当前 LetsGo 变更：${selected.changeId}，类型：${selected.type}，阶段：${selected.state}（${STATE_LABELS[selected.state] ?? selected.state}）。`
    : "当前未选择 LetsGo 变更。";
}

function isWriteTool(kind, command) {
  if (/(write|edit|multiedit|notebookedit|external_directory|externaldirectory)/.test(kind)) {
    return true;
  }

  if (/(bash|shell)/.test(kind)) {
    return isWriteBashCommand(command);
  }

  return false;
}

function isWriteBashCommand(command) {
  const trimmed = String(command ?? "").trim();
  const withoutSafeRedirects = stripSafeDiagnosticRedirects(trimmed);
  if (/>|>>/.test(withoutSafeRedirects)) {
    return true;
  }

  if (
    /\b(rm|mv|cp|touch|mkdir|rmdir|sed|perl|python|python3|node|npm|pnpm|yarn|tee|chmod|chown|ln|install|curl|wget)\b/.test(
      trimmed
    )
  ) {
    return true;
  }

  return /\b(git|hg|svn)\s+(add|commit|push|pull|rebase|merge|reset|checkout|stash|tag|branch|rm|mv|clean|restore|apply)\b/.test(
    trimmed
  );
}

function stripSafeDiagnosticRedirects(command) {
  return String(command ?? "")
    .replace(/(?:^|\s)[12]?>&[12](?=\s|$)/g, " ")
    .replace(/(?:^|\s)[012]?>>?\s*(?:\/dev\/null|NUL)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return String(value).match(/[^\s"'`<>|&;()]+/g) ?? [];
}

function tokenizeShellCommand(value) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|([^\s"'`<>|&;()]+)/g;
  for (const match of String(value).matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function cleanToken(token) {
  return token
    .replace(/^[,:[{]+/, "")
    .replace(/[,\].}]+$/, "")
    .replace(/^(--\w+=)/, "");
}

function looksLikeRelativeFilePath(token) {
  const normalized = String(token).replaceAll("\\", "/");
  return (
    !normalized.includes("://") &&
    !normalized.startsWith("-") &&
    (/^\.?[\w@. -]+\/[\w@./ -]+$/.test(normalized) ||
      /^[\w@ -]+\.[\w.-]+$/.test(normalized))
  );
}

function isAbsoluteToolPath(token) {
  return path.isAbsolute(token) || path.win32.isAbsolute(String(token).replaceAll("/", "\\"));
}

function resolveToolPath(projectDir, targetPath) {
  const project = String(projectDir ?? "");
  const target = String(targetPath ?? "");
  const windowsStyle = /^[A-Za-z]:[\\/]/.test(project) || /^[A-Za-z]:[\\/]/.test(target);
  if (windowsStyle) {
    const windowsProject = project.replaceAll("/", "\\");
    const windowsTarget = target.replaceAll("/", "\\");
    return path.win32.isAbsolute(windowsTarget)
      ? path.win32.normalize(windowsTarget)
      : path.win32.resolve(windowsProject, windowsTarget);
  }
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(project, target);
}

function relativePath(projectDir, targetPath) {
  const project = String(projectDir ?? "");
  const target = String(targetPath ?? "");
  const windowsStyle = /^[A-Za-z]:[\\/]/.test(project) || /^[A-Za-z]:[\\/]/.test(target);
  if (windowsStyle) {
    const relative = path.win32.relative(
      project.replaceAll("/", "\\"),
      target.replaceAll("/", "\\")
    );
    return relative
      .split(path.win32.sep)
      .join(path.posix.sep)
      .replace(/\/$/, "")
      .toLowerCase();
  }
  return path.relative(project, target).split(path.sep).join(path.posix.sep).replace(/\/$/, "");
}

function allow(reason) {
  return {
    status: "allow",
    reason,
  };
}

function deny(reason) {
  return {
    status: "deny",
    reason,
  };
}
