import { initProject } from "./commands/init.js";
import { updateProject } from "./commands/update.js";
import { enableProject } from "./commands/enable.js";
import { disableProject } from "./commands/disable.js";
import { doctorProject } from "./commands/doctor.js";
import { newChangeProject } from "./commands/new.js";
import { statusProject } from "./commands/status.js";
import { validateProject } from "./commands/validate.js";
import { advanceProject } from "./commands/advance.js";
import { selectProject } from "./commands/select.js";

const commands = {
  init: initProject,
  update: updateProject,
  enable: enableProject,
  disable: disableProject,
  doctor: doctorProject,
  new: newChangeProject,
  status: statusProject,
  validate: validateProject,
  advance: advanceProject,
  select: selectProject,
};

export async function main(argv) {
  const [commandName = "help", ...args] = argv;

  if (commandName === "help" || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  const command = commands[commandName];
  if (!command) {
    throw new Error(`未知命令：${commandName}`);
  }

  const options = parseArgs(commandName, args);
  const projectDir = options.projectDir ?? process.cwd();
  const result = await command({ projectDir, ...options });
  console.log(JSON.stringify(result, null, 2));

  if (result && result.ok === false) {
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Stitches

用法：
  stitches init [project-dir]
  stitches update [project-dir]
  stitches enable [project-dir]
  stitches disable [project-dir]
  stitches doctor [project-dir]
  stitches new <change-id> [--type feature|bugfix|refactor|test|maintenance] [project-dir]
  stitches status --change <change-id> [project-dir]
  stitches validate --before|--after <state> --change <change-id> [project-dir]
  stitches advance <state> --change <change-id> [project-dir]
  stitches select <change-id> [project-dir]`);
}

function parseArgs(commandName, args) {
  const options = {};
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--change" || arg === "-c") {
      options.changeId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--before") {
      options.mode = "before";
      options.state = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--after") {
      options.mode = "after";
      options.state = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project-dir" || arg === "--cwd") {
      options.projectDir = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--type" || arg === "-t") {
      options.type = args[index + 1];
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  if (["init", "update", "enable", "disable", "doctor"].includes(commandName)) {
    if (!options.projectDir && positional.length > 0) {
      options.projectDir = positional[0];
    }
    return options;
  }

  if (commandName === "new") {
    if (!options.changeId && positional.length > 0) {
      options.changeId = positional[0];
      positional.shift();
    }
    if (!options.projectDir && positional.length > 0) {
      options.projectDir = positional[0];
    }
    return options;
  }

  if (commandName === "advance") {
    if (!options.state && positional.length > 0) {
      options.state = positional[0];
      positional.shift();
    }
    if (!options.changeId && positional.length > 0) {
      options.changeId = positional[0];
      positional.shift();
    }
    if (!options.projectDir && positional.length > 0) {
      options.projectDir = positional[0];
    }
    return options;
  }

  if (commandName === "status") {
    if (!options.projectDir && positional.length > 0) {
      options.projectDir = positional[0];
    }
    return options;
  }

  if (commandName === "select") {
    if (!options.changeId && positional.length > 0) {
      options.changeId = positional[0];
      positional.shift();
    }
    if (!options.projectDir && positional.length > 0) {
      options.projectDir = positional[0];
    }
    return options;
  }

  if (!options.state && positional.length > 0) {
    options.state = positional[0];
    positional.shift();
  }

  if (!options.projectDir && positional.length > 0) {
    options.projectDir = positional[0];
  }

  return options;
}
