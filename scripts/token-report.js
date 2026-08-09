#!/usr/bin/env node
import { aggregateTranscript, appendReport } from "../lib/token-report.js";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseInput(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const input = parseInput(await readStdin());
const transcriptPath = input?.transcript_path;
const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  input?.working_directory ||
  process.cwd();

if (transcriptPath) {
  try {
    const report = await aggregateTranscript(transcriptPath);
    await appendReport(projectDir, report);
  } catch {
    // 静默失败：不阻断会话退出
  }
}

process.exit(0);
