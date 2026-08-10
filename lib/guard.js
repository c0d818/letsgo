import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { STATE_FILES, STATE_LABELS, STATES } from "../state/states.js";

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
  "task",
  "agent",
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

  return [
    "LetsGo 运行时守卫已启用。",
    "生命周期：clarify -> design -> plan -> apply -> verify -> archive -> done。",
    selectedLineOf(selected),
    "活跃变更：",
    activeSummary,
    "每阶段：先 `letsgo validate --before <state>`，完成后 `letsgo validate --after <state>` 再 `letsgo advance <state>`。",
    "多变更时用 `letsgo select <change-id>` 选择当前变更。",
    "只允许在当前阶段的写入范围内写文件；规划文档默认使用简体中文。",
  ].join("\n");
}

export async function buildActiveContext({ projectDir }) {
  if (!(await isLetsGoProject(projectDir))) {
    return "";
  }

  const active = await activeChanges(projectDir);
  const selected = await resolveActiveChange(projectDir, active);
  return selectedLineOf(selected);
}

export async function decideToolUse({ projectDir, toolName = "", toolInput = {} }) {
  const kind = String(toolName ?? "").toLowerCase();

  if (!(await isLetsGoProject(projectDir))) {
    return allow("项目未由 LetsGo 管理");
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
  const context = await resolveActiveChange(projectDir, active);
  if (!context) {
    return deny("写入被阻止：未选择活跃的 LetsGo 变更");
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
    return deny(
      `写入被阻止（${context.state} 阶段）：${denied
        .map((target) => relativePath(projectDir, target))
        .join(", ")}`
    );
  }

  return allow(`允许写入：${context.changeId} 的 ${context.state} 阶段`);
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

  for (const key of ["file_path", "notebook_path", "path"]) {
    if (typeof toolInput[key] === "string" && toolInput[key].trim()) {
      raw.add(toolInput[key].trim());
    }
  }

  if (typeof toolInput.command === "string") {
    for (const token of tokenize(toolInput.command)) {
      const cleaned = cleanToken(token);
      if (!cleaned) {
        continue;
      }
      if (cleaned.startsWith(projectDir) || cleaned.startsWith("openspec/") || looksLikeRelativeFilePath(cleaned)) {
        raw.add(cleaned);
      }
    }
  }

  return [...new Set(raw)].map((value) =>
    value.startsWith(projectDir) ? path.resolve(value) : path.resolve(projectDir, value)
  );
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

export async function isLetsGoProject(projectDir) {
  try {
    await access(path.join(projectDir, "openspec"));
    return true;
  } catch {
    return false;
  }
}

function isLetsGoCommand(command) {
  return /\bletsgo\b/.test(command);
}

function isAllowedBashCommand(command) {
  const trimmed = String(command ?? "").trim();
  return (
    /\b(npm|pnpm|yarn)\s+(test|run|lint|build|exec|--version|install)\b/.test(trimmed) ||
    isReadOnlyNodeCommand(trimmed)
  );
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

function hasShellControlOperators(command) {
  return /[;&|<>`]|\$\(/.test(String(command ?? ""));
}

function selectedLineOf(selected) {
  return selected
    ? `当前 LetsGo 变更：${selected.changeId}，类型：${selected.type}，阶段：${selected.state}（${STATE_LABELS[selected.state] ?? selected.state}）。`
    : "当前未选择 LetsGo 变更。";
}

function isWriteTool(kind, command) {
  if (/(write|edit|multiedit|notebookedit|external_directory)/.test(kind)) {
    return true;
  }

  if (/(bash|shell)/.test(kind)) {
    return isWriteBashCommand(command);
  }

  return false;
}

function isWriteBashCommand(command) {
  const trimmed = String(command ?? "").trim();
  if (/>|>>/.test(trimmed)) {
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

function tokenize(value) {
  return String(value).match(/[^\s"'`<>|&;()]+/g) ?? [];
}

function cleanToken(token) {
  return token
    .replace(/^[,:[{]+/, "")
    .replace(/[,\].}]+$/, "")
    .replace(/^(--\w+=)/, "");
}

function looksLikeRelativeFilePath(token) {
  return (
    !token.includes("://") &&
    !token.startsWith("-") &&
    /^\.?[\w@.-]+\/[\w@./-]+$/.test(token)
  );
}

function relativePath(projectDir, targetPath) {
  return path.relative(projectDir, targetPath).split(path.sep).join(path.posix.sep);
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
