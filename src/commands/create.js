const chalk = require("chalk");
const { getPrompts } = require("../prompts");
const { createApp } = require("../template");
const { checkNodeVersion, checkPackageManager } = require("../utils");
const { collectCliGateErrors } = require("../cli-validate");

function printNextSteps(config) {
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
}

function printFirebaseNotes(config) {
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
    return;
  }

  console.log(
    chalk.yellow.bold(
      "\nℹ️  Firebase skipped (enable it when creating the project to auto-configure)."
    )
  );
}

function printMapsNotes(config) {
  if (!config.maps?.enabled) {
    console.log(
      chalk.yellow.bold(
        "\nℹ️  Maps skipped (enable it when creating the project to auto-configure)."
      )
    );
    return;
  }

  if (config.maps?.provider !== "google-maps") {
    console.log(
      chalk.green.bold(
        "\n🗺️  Maps: react-native-maps configured (using Apple Maps on iOS)"
      )
    );
    return;
  }

  if (config.maps?.googleMapsApiKey) {
    console.log(chalk.green.bold("\n🗺️  Google Maps: API key configured!"));
    return;
  }

  console.log(chalk.yellow.bold("\n🗺️  Setup Google Maps:"));
  console.log(
    chalk.white("  1. Add GOOGLE_MAPS_API_KEY to android/local.properties")
  );
  console.log(
    chalk.white("  2. Update Google Maps API key in ios/AppDelegate.swift")
  );
}

async function createCommand(projectName, options) {
  try {
    console.log(chalk.cyan.bold("\n🚀 Create React Native App\n"));

    checkNodeVersion();

    const config = await getPrompts(projectName, options);

    if (!config.skipInstall) {
      if (!checkPackageManager(config.packageManager)) {
        process.exit(1);
      }
    }

    const gateErrors = collectCliGateErrors({
      projectName: config.projectName,
      bundleIdentifier: config.bundleIdentifier,
    });
    if (gateErrors.length > 0) {
      console.error(chalk.red("\n❌ Invalid project configuration:"));
      for (const message of gateErrors) {
        console.error(chalk.red(`  ${message}`));
      }
      process.exit(1);
    }

    await createApp(config);

    printNextSteps(config);
    printFirebaseNotes(config);
    printMapsNotes(config);

    if (config.uiKit?.enabled) {
      console.log(chalk.green.bold("\n🧩 UI kit copied to src/ui/components."));
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
}

module.exports = { createCommand };
