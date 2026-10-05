const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const { validateBundleIdentifier } = require("../cli-validate");

const DEFAULT_PROJECT_NAME = "MyApp";

function defaultBundleIdentifier(projectName) {
  return `com.${projectName.toLowerCase()}`;
}

// With --yes every project question is skipped and applyAnswers() falls back
// to the same defaults the prompts would have offered.
function collectQuestions(ctx) {
  const { projectNameArg, options } = ctx;
  ctx.questions = ctx.questions || [];
  const ask = !options.yes;

  if (!projectNameArg && ask) {
    ctx.questions.push({
      type: "input",
      name: "projectName",
      message: "What is your project name?",
      default: DEFAULT_PROJECT_NAME,
      validate: input => {
        if (!input || input.trim().length === 0) {
          return "Project name is required";
        }
        return true;
      },
    });
  }

  if (!options.bundleId && ask) {
    ctx.questions.push({
      type: "input",
      name: "bundleIdentifier",
      message: "What is your bundle identifier?",
      default: answers =>
        defaultBundleIdentifier(projectNameArg || answers.projectName),
      validate: input => validateBundleIdentifier(input) || true,
    });
  }

  if (!options.displayName && ask) {
    ctx.questions.push({
      type: "input",
      name: "displayName",
      message: "What is your app display name?",
      default: answers => projectNameArg || answers.projectName,
    });
  }

  if (!options.packageManager && ask) {
    ctx.questions.push({
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

  if (!options.skipInstall && !options.yes) {
    ctx.questions.push({
      type: "confirm",
      name: "installDependencies",
      message: "Install dependencies now?",
      default: true,
    });
  }
}

function applyAnswers(ctx, answers) {
  const { projectNameArg, options } = ctx;
  const config = ctx.config;

  config.projectName =
    projectNameArg || answers.projectName || DEFAULT_PROJECT_NAME;
  config.bundleIdentifier =
    options.bundleId ||
    answers.bundleIdentifier ||
    defaultBundleIdentifier(config.projectName);
  config.displayName =
    options.displayName || answers.displayName || config.projectName;
  config.packageManager =
    options.packageManager || answers.packageManager || "pnpm";
  config.skipInstall =
    options.skipInstall ||
    (options.yes ? false : !answers.installDependencies);
  config.skipGit = options.skipGit || false;
  config.skipPods = options.skipPods || false;
  config.autoYes = options.yes || false;
  config.projectPath = path.join(process.cwd(), config.projectName);
}

async function confirmOverwrite(ctx) {
  const { options } = ctx;
  const { projectPath, projectName } = ctx.config;

  if (!(await fs.pathExists(projectPath))) {
    return;
  }

  if (options.yes) {
    console.log(
      chalk.cyan(`Directory ${projectName} already exists. Overwriting...`)
    );
    return;
  }

  const inquirer = require("inquirer");
  const { overwrite } = await inquirer.prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: chalk.yellow(
        `Directory ${projectName} already exists. Overwrite?`
      ),
      default: false,
    },
  ]);

  if (!overwrite) {
    console.log(chalk.red("Aborted."));
    process.exit(0);
  }
}

module.exports = {
  DEFAULT_PROJECT_NAME,
  collectQuestions,
  applyAnswers,
  confirmOverwrite,
};
