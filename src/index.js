const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const validateProjectName = require('validate-npm-package-name');
const { getPrompts } = require('./prompts');
const { createApp } = require('./template');
const { checkNodeVersion, checkPackageManager } = require("./utils");
const packageJson = require("../package.json");

async function run() {
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
    .action(async (projectName, options) => {
      try {
        console.log(chalk.cyan.bold("\n🚀 Create React Native App\n"));

        // Check Node version
        checkNodeVersion();

        // Get project configuration
        const config = await getPrompts(projectName, options);

        // Check if package manager is installed
        if (!config.skipInstall) {
          if (!checkPackageManager(config.packageManager)) {
            process.exit(1);
          }
        }

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
        console.log(chalk.green.bold("\n" + "=".repeat(50)));
        console.log(chalk.green.bold("✅ Project created successfully!"));
        console.log(chalk.green.bold("=".repeat(50) + "\n"));

        console.log(chalk.cyan.bold("📂 Next steps:\n"));
        console.log(chalk.white(`  cd ${config.projectName}`));

        if (config.skipInstall) {
          console.log(chalk.white(`  ${config.packageManager} install`));
          if (process.platform === "darwin") {
            console.log(chalk.white(`  cd ios && pod install`));
          }
        }

        if (config.firebase?.enabled) {
          console.log(chalk.yellow.bold("\n📱 Setup Firebase:"));
          console.log(
            chalk.white(
              "  Firebase enabled. We copied Google config files for selected environments."
            )
          );
          console.log(
            chalk.white(
              "  Verify google-services.json and GoogleService-Info.plist are present for each environment."
            )
          );
        } else {
          console.log(
            chalk.yellow.bold(
              "\nℹ️  Firebase skipped (enable it when creating the project to auto-configure)."
            )
          );
        }

        if (config.maps?.enabled) {
          if (config.maps?.provider === "google-maps") {
            if (config.maps?.googleMapsApiKey) {
              console.log(
                chalk.green.bold("\n🗺️  Google Maps: API key configured!")
              );
            } else {
              console.log(chalk.yellow.bold("\n🗺️  Setup Google Maps:"));
              console.log(
                chalk.white(
                  "  1. Add GOOGLE_MAPS_API_KEY to android/local.properties"
                )
              );
              console.log(
                chalk.white(
                  "  2. Update Google Maps API key in ios/AppDelegate.swift"
                )
              );
            }
          } else {
            console.log(
              chalk.green.bold(
                "\n🗺️  Maps: react-native-maps configured (using Apple Maps on iOS)"
              )
            );
          }
        } else {
          console.log(
            chalk.yellow.bold(
              "\nℹ️  Maps skipped (enable it when creating the project to auto-configure)."
            )
          );
        }

        console.log(chalk.cyan.bold("\n🏃 Run the app:\n"));
        console.log(chalk.white(`  ${config.packageManager} run ios`));
        console.log(chalk.white(`  ${config.packageManager} run android`));

        console.log(
          chalk.gray("\n📚 For more info, check SETUP.md in your project\n")
        );
      } catch (error) {
        console.error(chalk.red("\n❌ Error creating project:"), error.message);
        process.exit(1);
      }
    });

  program.parse();
}

run();

