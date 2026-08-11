import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function aggregateTranscript(mainTranscriptPath, { stages = [] } = {}) {
  const sessionDir = path.dirname(mainTranscriptPath);
  const main = await readTranscriptStats(mainTranscriptPath, "主代理");
  const subagents = [];
  const sessionName = path.basename(mainTranscriptPath, ".jsonl");
  const subagentsDir = path.join(sessionDir, sessionName, "subagents");

  let entries = [];
  try {
    entries = await readdir(subagentsDir);
  } catch {
    entries = [];
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith(".jsonl")) {
      continue;
    }
    subagents.push(await readTranscriptStats(path.join(subagentsDir, entry), null));
  }

  const groupedSubagents = groupAgentStats(subagents);

  const mainTotal = totalOf(main);
  const subTotal = groupedSubagents.reduce((sum, item) => sum + totalOf(item), 0);
  return {
    sessionId: path.basename(mainTranscriptPath, ".jsonl"),
    main,
    subagents: groupedSubagents,
    stageDeltas: await stageDeltasOf({
      mainTranscriptPath,
      subagentPaths: entries
        .filter((entry) => entry.endsWith(".jsonl"))
        .sort()
        .map((entry) => path.join(subagentsDir, entry)),
      stages,
    }),
    totals: {
      main: mainTotal,
      subagents: subTotal,
      all: mainTotal + subTotal,
    },
  };
}

export function formatMarkdown(report) {
  const rows = [
    rowOf("主代理", report.main),
    ...report.subagents.map((item) => rowOf(item.name, item)),
  ];
  const header = "| 代理 | 调用数 | 输入 | 输出 | 缓存读取 | 缓存写入 | 总计 |";
  const divider = "| --- | ---: | ---: | ---: | ---: | ---: | ---: |";
  const body = rows.map(
    ([name, runs, input, output, cacheRead, cacheWrite, total]) =>
      `| ${name} | ${runs} | ${input} | ${output} | ${cacheRead} | ${cacheWrite} | ${total} |`
  );
  const totalRow = `| **合计** | — | — | — | — | — | **${report.totals.all}** |`;
  const stageRows = (report.stageDeltas ?? []).map(
    (item) => `| ${item.stage} | ${item.input} | ${item.output} | ${item.cacheRead} | ${item.cacheWrite} | ${item.total} |`
  );
  const stageSection = stageRows.length > 0
    ? [
        "",
        "## 阶段增量",
        "",
        "| 阶段 | 输入 | 输出 | 缓存读取 | 缓存写入 | 总计 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...stageRows,
      ]
    : [];

  return [
    "# Token 用量报告",
    "",
    "> 当前文件为最新累计快照，重复生成时覆盖写入，不追加历史快照。",
    "",
    `## Token 用量：${report.sessionId}`,
    `生成时间：${new Date().toISOString()}`,
    "",
    header,
    divider,
    ...body,
    totalRow,
    ...stageSection,
    "",
  ].join("\n");
}

export async function appendReport(projectDir, report) {
  const reportPath = path.join(projectDir, "openspec", ".letsgo", "token-report.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, formatMarkdown(report));
  return reportPath;
}

export async function latestTranscriptForProject(projectDir) {
  const projectsDir = path.join(os.homedir(), ".claude", "projects", encodeProjectPath(projectDir));
  let entries = [];
  try {
    entries = await readdir(projectsDir);
  } catch {
    return null;
  }

  const transcripts = [];
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) {
      continue;
    }
    const filePath = path.join(projectsDir, entry);
    try {
      const info = await stat(filePath);
      transcripts.push({ path: filePath, mtimeMs: info.mtimeMs });
    } catch {
      // 忽略无法读取的记录
    }
  }

  transcripts.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return transcripts[0]?.path ?? null;
}

export function encodeProjectPath(projectDir) {
  return path.resolve(projectDir).replace(/[\/.]/g, "-");
}

async function readTranscriptStats(filePath, fallbackName, { from = null, to = null } = {}) {
  const usage = emptyUsage();
  let agentName = fallbackName;
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    raw = "";
  }

  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event?.type !== "assistant") {
      continue;
    }

    if (from || to) {
      const timestamp = Date.parse(event.timestamp ?? "");
      if (!Number.isFinite(timestamp)) {
        continue;
      }
      if (from && timestamp < Date.parse(from)) {
        continue;
      }
      if (to && timestamp > Date.parse(to)) {
        continue;
      }
    }

    if (!agentName && typeof event.attributionAgent === "string" && event.attributionAgent) {
      agentName = event.attributionAgent;
    }

    const u = event.message?.usage;
    if (!u || typeof u !== "object") {
      continue;
    }
    usage.input += number(u.input_tokens);
    usage.output += number(u.output_tokens);
    usage.cacheRead += number(u.cache_read_input_tokens);
    usage.cacheWrite += number(u.cache_creation_input_tokens);
  }

  return {
    name: agentName ?? path.basename(filePath, ".jsonl"),
    ...usage,
  };
}

function rowOf(name, stats) {
  return [name, stats.runs ?? 1, stats.input, stats.output, stats.cacheRead, stats.cacheWrite, totalOf(stats)];
}

function totalOf(stats) {
  return stats.input + stats.output + stats.cacheRead + stats.cacheWrite;
}

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function groupAgentStats(stats) {
  const grouped = new Map();
  for (const item of stats) {
    const name = canonicalAgentReportName(item.name);
    const current = grouped.get(name) ?? { name, runs: 0, ...emptyUsage() };
    current.runs += 1;
    current.input += item.input;
    current.output += item.output;
    current.cacheRead += item.cacheRead;
    current.cacheWrite += item.cacheWrite;
    grouped.set(name, current);
  }
  return [...grouped.values()];
}

function canonicalAgentReportName(name) {
  const value = String(name ?? "");
  if (/^letsgo-/.test(value)) {
    return `lg:${value}`;
  }
  return value;
}

async function stageDeltasOf({ mainTranscriptPath, subagentPaths, stages }) {
  const completed = stages.filter((item) => item?.stage && item?.startedAt && item?.completedAt);
  const deltas = [];
  for (const stage of completed) {
    const options = { from: stage.startedAt, to: stage.completedAt };
    const parts = [
      await readTranscriptStats(mainTranscriptPath, "主代理", options),
      ...(await Promise.all(subagentPaths.map((filename) => readTranscriptStats(filename, null, options)))),
    ];
    const usage = parts.reduce(
      (sum, item) => ({
        input: sum.input + item.input,
        output: sum.output + item.output,
        cacheRead: sum.cacheRead + item.cacheRead,
        cacheWrite: sum.cacheWrite + item.cacheWrite,
      }),
      emptyUsage()
    );
    deltas.push({ stage: stage.stage, ...usage, total: totalOf(usage) });
  }
  return deltas;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
