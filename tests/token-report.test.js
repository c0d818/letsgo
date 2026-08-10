import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  aggregateTranscript,
  appendReport,
  encodeProjectPath,
  formatMarkdown,
} from "../lib/token-report.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "letsgo-token-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assistantLine({ agent = null, usage }) {
  const event = {
    type: "assistant",
    sessionId: "s1",
    message: { usage },
  };
  if (agent) {
    event.attributionAgent = agent;
  }
  return JSON.stringify(event);
}

async function makeTranscripts(sessionDir) {
  const mainPath = path.join(sessionDir, "session.jsonl");
  await mkdir(path.join(sessionDir, "session", "subagents"), { recursive: true });
  await writeFile(mainPath, [
    assistantLine({
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    }),
    JSON.stringify({ type: "user", message: "你好" }),
    assistantLine({ usage: { input_tokens: 50, output_tokens: 5 } }),
    "not-json",
  ].join("\n"));
  await writeFile(path.join(sessionDir, "session", "subagents", "a.jsonl"), [
    assistantLine({
      agent: "lg:letsgo-design-writer",
      usage: { input_tokens: 200, output_tokens: 30 },
    }),
  ].join("\n"));
  await writeFile(path.join(sessionDir, "session", "subagents", "b.jsonl"), [
    assistantLine({
      agent: "lg:letsgo-reviewer",
      usage: { input_tokens: 80, output_tokens: 10, cache_read_input_tokens: 20 },
    }),
  ].join("\n"));
  return mainPath;
}

test("token 报告解析主代理与 subagent 的用量", async () => {
  await withTempProject(async (sessionDir) => {
    const mainPath = await makeTranscripts(sessionDir);
    const report = await aggregateTranscript(mainPath);

    assert.equal(report.sessionId, "session");
    assert.equal(report.main.input, 150);
    assert.equal(report.main.output, 25);
    assert.equal(report.main.cacheRead, 10);
    assert.equal(report.main.cacheWrite, 5);
    assert.deepEqual(
      report.subagents.map((item) => item.name),
      ["lg:letsgo-design-writer", "lg:letsgo-reviewer"]
    );
    assert.equal(report.subagents[0].input, 200);
    assert.equal(report.subagents[1].input, 80);
    assert.equal(report.totals.all, 530);
  });
});

test("token 报告写入 openspec/.letsgo/token-report.md", async () => {
  await withTempProject(async (dir) => {
    const sessionDir = path.join(dir, "session");
    const mainPath = await makeTranscripts(sessionDir);
    const report = await aggregateTranscript(mainPath);

    const reportPath = await appendReport(dir, report);
    const content = await readFile(reportPath, "utf8");

    assert.match(content, /# Token 用量报告/);
    assert.match(content, /lg:letsgo-reviewer/);
    assert.match(content, /\*\*合计\*\*.*\*\*530\*\*/);
  });
});

test("formatMarkdown 生成可读表格", () => {
  const markdown = formatMarkdown({
    sessionId: "s1",
    main: { name: "主代理", input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    subagents: [{ name: "lg:letsgo-reviewer", input: 5, output: 6, cacheRead: 0, cacheWrite: 0 }],
    totals: { main: 10, subagents: 11, all: 21 },
  });
  assert.match(markdown, /\| 主代理 \| 1 \| 2 \| 3 \| 4 \| 10 \|/);
  assert.match(markdown, /lg:letsgo-reviewer/);
  assert.match(markdown, /\*\*21\*\*/);
});

test("encodeProjectPath 匹配 Claude Code 目录编码", () => {
  assert.equal(
    encodeProjectPath("/Users/gc0d/Desktop/rain-agent"),
    "-Users-gc0d-Desktop-rain-agent"
  );
});

test("cli tokens 生成报告并输出汇总", async () => {
  await withTempProject(async (dir) => {
    const sessionDir = path.join(dir, "session");
    const mainPath = await makeTranscripts(sessionDir);
    const projectDir = path.join(dir, "project");
    await mkdir(projectDir, { recursive: true });

    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, "letsgo"), "tokens", mainPath, projectDir],
      { cwd: packageRoot }
    );
    const result = JSON.parse(stdout);

    assert.equal(result.report.totals.all, 530);
    assert.equal(result.report.subagents.length, 2);
    await stat(path.join(projectDir, "openspec/.letsgo/token-report.md"));
  });
});
