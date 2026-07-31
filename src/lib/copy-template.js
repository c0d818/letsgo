import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { existsAtPath } from "./paths.js";

export async function copyTemplateTree({ fromDir, toDir, force = false }) {
  const created = [];
  const updated = [];
  const skipped = [];

  await mkdir(toDir, { recursive: true });
  await copyEntries(fromDir, toDir, fromDir, toDir, { force, created, updated, skipped });

  return { projectDir: toDir, created, updated, skipped };
}

async function copyEntries(fromDir, toDir, rootFromDir, rootToDir, result) {
  const entries = await readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const source = path.join(fromDir, entry.name);
    const relativeSource = path.relative(rootFromDir, source);
    const target = path.join(rootToDir, relativeSource);
    const relativeTarget = path.relative(rootToDir, target);

    if (entry.isDirectory()) {
      await mkdir(target, { recursive: true });
      await copyEntries(source, target, rootFromDir, rootToDir, result);
      continue;
    }

    if (!result.force && await existsAtPath(target)) {
      result.skipped.push(relativeTarget);
      continue;
    }

    const existed = await existsAtPath(target);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
    (existed ? result.updated : result.created).push(relativeTarget);
  }
}
