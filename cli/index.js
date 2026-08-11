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
import { tokensProject } from "./commands/tokens.js";
import { recoverProject } from "./commands/recover.js";

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
  tokens: tokensProject,
  recover: recoverProject,
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
  console.log(`LetsGo

用法：
  letsgo init [project-dir]
  letsgo update [project-dir]
  letsgo enable [project-dir]
  letsgo disable [project-dir]
  letsgo doctor [project-dir]
  letsgo new <change-id> [--type feature|bugfix|refactor|test|maintenance] [project-dir]
  letsgo status --change <change-id> [project-dir]
  letsgo validate --before|--after <state> --change <change-id> [project-dir]
  letsgo advance <state> --change <change-id> [project-dir]
  letsgo select <change-id> [project-dir]
  letsgo recover [project-dir]
  letsgo tokens [transcript-path] [project-dir]`);
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

  if (["init", "update", "enable", "disable", "doctor", "recover"].includes(commandName)) {
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

  if (commandName === "tokens") {
    if (!options.transcriptPath && positional.length > 0) {
      options.transcriptPath = positional[0];
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
