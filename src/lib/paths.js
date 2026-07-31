import { access, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(currentFile), "../..");

export const templateRoot = path.join(packageRoot, "templates");
export const commandRoot = path.join(packageRoot, "commands");
export const skillRoot = path.join(packageRoot, "skills");

export async function existsAt(baseDir, relativePath) {
  return existsAtPath(path.join(baseDir, relativePath));
}

export async function existsAtPath(fullPath) {
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function renameIfExists(baseDir, fromRelative, toRelative) {
  const from = path.join(baseDir, fromRelative);
  const to = path.join(baseDir, toRelative);

  if (!await existsAtPath(from) || await existsAtPath(to)) {
    return false;
  }

  await rename(from, to);
  return true;
}
