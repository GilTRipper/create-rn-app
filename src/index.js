const { program } = require("commander");
const { createCommand } = require("./commands/create");
const { featuresCommand } = require("./commands/features");
const { healthcheckCommand } = require("./commands/healthcheck");
const { adoptCommand } = require("./commands/adopt");
const { addCommand } = require("./commands/add");
const { upgradeCommand } = require("./commands/upgrade");
const packageJson = require("../package.json");

const PROJECT_PATH_FLAG = [
  "--path <path>",
  "Project directory (defaults to the current one)",
];

// The root command declares -y/--yes too, and commander hands a shared flag to
// the parent - a subcommand that redeclares it would read undefined. Merging
// the parent's options in keeps every flag visible wherever it was typed.
function withGlobals(handler) {
  return (options, command) => handler(command.optsWithGlobals());
}

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
    .action(withGlobals(featuresCommand));

  program
    .command("adopt")
    .description(
      "Record a manifest for a project created before the CLI wrote one"
    )
    .option(...PROJECT_PATH_FLAG)
    .option("--from <version>", "CLI version that created the project")
    .option("-y, --yes", "Accept the detected configuration without prompting")
    .option("--force", "Overwrite an existing manifest")
    .action(withGlobals(adoptCommand));

  program
    .command("add <feature>")
    .description("Add an optional feature to an existing project")
    .option(...PROJECT_PATH_FLAG)
    .option("--dry-run", "Show what would change without writing anything")
    .option("-y, --yes", "Accept defaults and write conflict markers")
    .option("--fonts-dir <path>", "Fonts directory (assets)")
    .option("--splash-dir <path>", "Splash screen directory (assets)")
    .option(
      "--app-icon-dir <path>",
      "App icon directory, with optional per-environment subfolders (assets)"
    )
    .action((feature, options, command) => addCommand(feature, command.optsWithGlobals()));

  program
    .command("upgrade")
    .description("Bring a project up to this version of the template")
    .option(...PROJECT_PATH_FLAG)
    .option("--dry-run", "Show what would change without writing anything")
    .option("-y, --yes", "Write conflict markers instead of asking")
    .action(withGlobals(upgradeCommand));

  program
    .command("healthcheck")
    .description("Report the state of a project created by create-rn-app")
    .option(...PROJECT_PATH_FLAG)
    .action(withGlobals(healthcheckCommand));

  program.parse();
}

run();
