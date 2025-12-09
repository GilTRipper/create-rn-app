const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

async function getPrompts(projectNameArg, options) {
  const questions = [];

  // Ask for project name if not provided
  if (!projectNameArg) {
    questions.push({
      type: "input",
      name: "projectName",
      message: "What is your project name?",
      default: "MyApp",
      validate: input => {
        if (!input || input.trim().length === 0) {
          return "Project name is required";
        }
        return true;
      },
    });
  }

  // Ask for bundle identifier if not provided
  if (!options.bundleId) {
    questions.push({
      type: "input",
      name: "bundleIdentifier",
      message: "What is your bundle identifier?",
      default: answers => {
        const name = projectNameArg || answers.projectName;
        return `com.${name.toLowerCase()}`;
      },
      validate: input => {
        if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(input)) {
          return "Bundle identifier must be in format: com.company.app";
        }
        return true;
      },
    });
  }

  // Ask for display name if not provided
  if (!options.displayName) {
    questions.push({
      type: "input",
      name: "displayName",
      message: "What is your app display name?",
      default: answers => projectNameArg || answers.projectName,
    });
  }

  // Ask for package manager if not provided
  if (!options.packageManager) {
    questions.push({
      type: "list",
      name: "packageManager",
      message: "Which package manager would you like to use?",
      choices: [
        { name: "pnpm (recommended)", value: "pnpm" },
        { name: "npm", value: "npm" },
        { name: "yarn", value: "yarn" },
      ],
      default: "pnpm",
    });
  }

  // Ask about dependency installation
  if (!options.skipInstall && !options.yes) {
    questions.push({
      type: "confirm",
      name: "installDependencies",
      message: "Install dependencies now?",
      default: true,
    });
  }

  // Ask about splash screen images directory if not provided via options
  if (!options.splashScreenDir) {
    questions.push({
      type: "input",
      name: "splashScreenDir",
      message:
        "Path to directory with splash screen images (optional, press Enter to skip):",
      default: "",
      validate: async input => {
        if (!input || input.trim().length === 0) {
          return true; // Optional, so empty is valid
        }
        const dirPath = path.isAbsolute(input)
          ? input
          : path.join(process.cwd(), input);
        if (!(await fs.pathExists(dirPath))) {
          return "Directory does not exist";
        }
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          return "Path is not a directory";
        }
        return true;
      },
    });
  }

  const answers = await inquirer.prompt(questions);

  // Check if directory already exists
  const projectPath = path.join(
    process.cwd(),
    projectNameArg || answers.projectName
  );
  if (await fs.pathExists(projectPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: chalk.yellow(
          `Directory ${
            projectNameArg || answers.projectName
          } already exists. Overwrite?`
        ),
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.red("Aborted."));
      process.exit(0);
    }
  }

  // Resolve splash screen directory path
  let splashScreenDir = null;
  const splashSource = options.splashScreenDir || answers.splashScreenDir;
  if (splashSource && splashSource.trim().length > 0) {
    splashScreenDir = path.isAbsolute(splashSource)
      ? splashSource
      : path.join(process.cwd(), splashSource);
    splashScreenDir = path.normalize(splashScreenDir);
  }

  return {
    projectName: projectNameArg || answers.projectName,
    bundleIdentifier: options.bundleId || answers.bundleIdentifier,
    displayName: options.displayName || answers.displayName,
    packageManager: options.packageManager || answers.packageManager || "pnpm",
    skipInstall:
      options.skipInstall ||
      (options.yes ? false : !answers.installDependencies),
    skipGit: options.skipGit || false,
    skipPods: options.skipPods || false,
    autoYes: options.yes || false,
    projectPath,
    splashScreenDir,
  };
}

module.exports = { getPrompts };

