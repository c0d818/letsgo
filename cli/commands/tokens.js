import path from "node:path";
import {
  aggregateTranscript,
  appendReport,
  latestTranscriptForProject,
} from "../../lib/token-report.js";
import { readRunSummary } from "../../lib/run-summary.js";

export async function tokensProject({ projectDir, transcriptPath }) {
  const resolved = transcriptPath
    ? path.resolve(transcriptPath)
    : await latestTranscriptForProject(projectDir);
  if (!resolved) {
    throw new Error(`未找到 ${projectDir} 的会话记录；可手动指定 transcript 路径`);
  }

  const summary = await readRunSummary(projectDir);
  const report = await aggregateTranscript(resolved, { stages: summary?.stages ?? [] });
  const reportPath = await appendReport(projectDir, report);
  return {
    projectDir,
    transcript: resolved,
    reportPath,
    report,
  };
}
