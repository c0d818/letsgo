import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function aggregateTranscript(mainTranscriptPath) {
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

  const mainTotal = totalOf(main);
  const subTotal = subagents.reduce((sum, item) => sum + totalOf(item), 0);
  return {
    sessionId: path.basename(mainTranscriptPath, ".jsonl"),
    main,
    subagents,
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
  const header = "| 代理 | 输入 | 输出 | 缓存读取 | 缓存写入 | 总计 |";
  const divider = "| --- | ---: | ---: | ---: | ---: | ---: |";
  const body = rows.map(
    ([name, input, output, cacheRead, cacheWrite, total]) =>
      `| ${name} | ${input} | ${output} | ${cacheRead} | ${cacheWrite} | ${total} |`
  );
  const totalRow = `| **合计** | — | — | — | — | **${report.totals.all}** |`;

  return [
    `## Token 用量：${report.sessionId}`,
    `生成时间：${new Date().toISOString()}`,
    "",
    header,
    divider,
    ...body,
    totalRow,
    "",
  ].join("\n");
}

export async function appendReport(projectDir, report) {
  const reportPath = path.join(projectDir, "openspec", ".letsgo", "token-report.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  let previous = "";
  try {
    previous = await readFile(reportPath, "utf8");
  } catch {
    previous = "";
  }
  const content = `${previous ? `${previous}\n` : "# Token 用量报告\n\n"}${formatMarkdown(report)}`;
  await writeFile(reportPath, content);
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

async function readTranscriptStats(filePath, fallbackName) {
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
  return [name, stats.input, stats.output, stats.cacheRead, stats.cacheWrite, totalOf(stats)];
}

function totalOf(stats) {
  return stats.input + stats.output + stats.cacheRead + stats.cacheWrite;
}

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
