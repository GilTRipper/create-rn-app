const { program } = require("commander");
const { createCommand } = require("./commands/create");
const { featuresCommand } = require("./commands/features");
const { healthcheckCommand } = require("./commands/healthcheck");
const packageJson = require("../package.json");

const PROJECT_PATH_FLAG = [
  "--path <path>",
  "Project directory (defaults to the current one)",
];

function run() {
  program
    .name("create-rn-app")
    .description("Create a new React Native app with pre-configured setup")
    .version(packageJson.version, "-v, --version", "display version number")
    .argument("[project-name]", "Name of the project")
    .option("--skip-install", "Skip dependency installation")
    .option("--skip-pods", "Skip iOS CocoaPods installation")
    .option("--skip-git", "Skip git initialization")
    .option("-y, --yes", "Answer yes to all prompts")
    .option(
      "-p, --package-manager <manager>",
      "Package manager to use (npm, yarn, pnpm)"
    )
    .option(
      "-b, --bundle-id <bundleId>",
      "Bundle identifier (e.g., com.company.app)"
    )
    .option("-d, --display-name <displayName>", "App display name")
    .option(
      "--splash-screen-dir <path>",
      "Path to directory with splash screen images (optional)"
    )
    .option(
      "--app-icon-dir <path>",
      "Path to directory with app icons (optional, from appicon.co output)"
    )
    .action(createCommand);

  program
    .command("features")
    .description("List optional features and what a project already has")
    .option(...PROJECT_PATH_FLAG)
    .action(featuresCommand);

  program
    .command("healthcheck")
    .description("Report the state of a project created by create-rn-app")
    .option(...PROJECT_PATH_FLAG)
    .action(healthcheckCommand);

  program.parse();
}

run();
