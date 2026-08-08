#!/usr/bin/env node
import { buildSystemRules } from "../lib/guard.js";

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
const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  input.cwd ||
  input.working_directory ||
  process.cwd();
const rules = await buildSystemRules({ projectDir });

if (!rules) {
  process.stdout.write("{}");
} else {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        additionalContext: rules,
      },
    })
  );
}
