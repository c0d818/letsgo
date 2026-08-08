import { initProject } from "./init.js";

export async function updateProject({ projectDir }) {
  return initProject({ projectDir, force: true });
}
