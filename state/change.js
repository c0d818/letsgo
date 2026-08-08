import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyTemplateTree } from "../lib/copy-template.js";
import { changeTypeTemplateRoot, existsAtPath } from "../lib/paths.js";
import { assertChangeType, DEFAULT_CHANGE_TYPE } from "./change-types.js";
import { initialStatus } from "./states.js";

export function changeDir(projectDir, changeId) {
  return path.join(projectDir, "openspec", "changes", changeId);
}

export function changeFile(projectDir, changeId, filename) {
  return path.join(changeDir(projectDir, changeId), filename);
}

export async function createChange(projectDir, changeId, type = DEFAULT_CHANGE_TYPE) {
  assertChangeType(type);
  const dir = changeDir(projectDir, changeId);
  const statusPath = path.join(dir, "status.json");

  await mkdir(dir, { recursive: true });
  if (await existsAtPath(statusPath)) {
    return readStatus(projectDir, changeId);
  }

  await installChangeTemplates(projectDir, dir, type);

  const status = initialStatus(changeId, type);
  await writeStatus(projectDir, changeId, status);
  return status;
}

async function installChangeTemplates(projectDir, targetDir, type) {
  const localTemplateRoot = path.join(projectDir, "openspec", "change-types");
  const typeTemplate = await resolveTemplateDir(localTemplateRoot, type);

  await copyTemplateTree({
    fromDir: typeTemplate,
    toDir: targetDir,
    force: false,
  });
}

async function resolveTemplateDir(localTemplateRoot, name) {
  const local = path.join(localTemplateRoot, name);
  if (await existsAtPath(local)) {
    return local;
  }
  return path.join(changeTypeTemplateRoot, name);
}

export async function readStatus(projectDir, changeId) {
  const statusPath = changeFile(projectDir, changeId, "status.json");
  const raw = await readFile(statusPath, "utf8");
  return JSON.parse(raw);
}

export async function writeStatus(projectDir, changeId, status) {
  const dir = changeDir(projectDir, changeId);
  await mkdir(dir, { recursive: true });
  const next = {
    ...status,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(changeFile(projectDir, changeId, "status.json"), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function readChangeText(projectDir, changeId, filename) {
  return readFile(changeFile(projectDir, changeId, filename), "utf8");
}
