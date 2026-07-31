import { initProject } from "./commands/init.js";
import { updateProject } from "./commands/update.js";
import { enableProject } from "./commands/enable.js";
import { disableProject } from "./commands/disable.js";
import { doctorProject } from "./commands/doctor.js";

const commands = {
  init: initProject,
  update: updateProject,
  enable: enableProject,
  disable: disableProject,
  doctor: doctorProject,
};

export async function main(argv) {
  const [commandName = "help", ...args] = argv;

  if (commandName === "help" || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  const command = commands[commandName];
  if (!command) {
    throw new Error(`Unknown command: ${commandName}`);
  }

  const projectDir = args[0] ?? process.cwd();
  const result = await command({ projectDir });
  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`Stitches

Usage:
  stitches init [project-dir]
  stitches update [project-dir]
  stitches enable [project-dir]
  stitches disable [project-dir]
  stitches doctor [project-dir]`);
}
