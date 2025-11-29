const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const validateProjectName = require('validate-npm-package-name');
const { getPrompts } = require('./prompts');
const { createApp } = require('./template');
const { checkNodeVersion } = require('./utils');
const packageJson = require("../package.json");

async function run() {
  console.log(chalk.cyan.bold("\n🚀 Create React Native App\n"));

  program
    .name("create-rn-app")
    .description("Create a new React Native app with pre-configured setup")
    .version(packageJson.version, "-v, --version", "display version number")
    .argument("[project-name]", "Name of the project")
    .option("--skip-install", "Skip dependency installation")
    .option("--skip-git", "Skip git initialization")
    .option(
      "-p, --package-manager <manager>",
      "Package manager to use (npm, yarn, pnpm)",
      "pnpm"
    )
    .action(async (projectName, options) => {
      try {
        // Check Node version
        checkNodeVersion();

        // Get project configuration
        const config = await getPrompts(projectName, options);

        // Validate project name
        const validation = validateProjectName(config.projectName);
        if (!validation.validForNewPackages) {
          console.error(
            chalk.red("\n❌ Invalid project name:"),
            validation.errors?.join(", ") || validation.warnings?.join(", ")
          );
          process.exit(1);
        }

        // Create the app
        await createApp(config);

        // Success message
        console.log(chalk.green.bold("\n✅ Project created successfully!\n"));
        console.log(chalk.cyan("Next steps:\n"));
        console.log(`  cd ${config.projectName}`);

        if (config.skipInstall) {
          console.log(`  ${config.packageManager} install`);
        }

        console.log(chalk.yellow("\n📱 Setup Firebase:"));
        console.log("  1. Add google-services.json to android/app/");
        console.log("  2. Add GoogleService-Info.plist to ios/");

        console.log(chalk.yellow("\n🗺️  Setup Google Maps:"));
        console.log("  1. Add GOOGLE_MAPS_API_KEY to android/local.properties");
        console.log("  2. Add Google Maps API key to ios/");

        console.log(chalk.cyan("\n🏃 Run the app:\n"));
        console.log(`  ${config.packageManager} run ios`);
        console.log(`  ${config.packageManager} run android\n`);
      } catch (error) {
        console.error(chalk.red("\n❌ Error creating project:"), error.message);
        process.exit(1);
      }
    });

  program.parse();
}

run();

