const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { FIREBASE_LIB_MODULES } = require("../../shared/paths");

function getGoogleFilesByEnv(firebaseConfig) {
  if (!firebaseConfig || !firebaseConfig.filesByEnv) {
    return {};
  }
  return firebaseConfig.filesByEnv;
}

async function copyFirebaseLibModules(projectPath, modules = []) {
  if (!modules || modules.length === 0) {
    return;
  }

  const sourceLibPath = FIREBASE_LIB_MODULES;

  // Check if source directory exists
  if (!(await fs.pathExists(sourceLibPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Firebase lib modules directory not found: ${sourceLibPath}. Skipping Firebase lib modules copy.`
      )
    );
    return;
  }

  const targetLibPath = path.join(projectPath, "src/lib");
  await fs.ensureDir(targetLibPath);

  // Copy analytics if selected
  if (modules.includes("analytics")) {
    const sourceAnalyticsPath = path.join(sourceLibPath, "analytics");
    const targetAnalyticsPath = path.join(targetLibPath, "analytics");

    if (await fs.pathExists(sourceAnalyticsPath)) {
      await fs.copy(sourceAnalyticsPath, targetAnalyticsPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied analytics lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Analytics source directory not found: ${sourceAnalyticsPath}`
        )
      );
    }
  }

  // Copy remote-config if selected
  if (modules.includes("remote-config")) {
    const sourceRemoteConfigPath = path.join(sourceLibPath, "remote-config");
    const targetRemoteConfigPath = path.join(targetLibPath, "remote-config");

    if (await fs.pathExists(sourceRemoteConfigPath)) {
      await fs.copy(sourceRemoteConfigPath, targetRemoteConfigPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied remote-config lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Remote Config source directory not found: ${sourceRemoteConfigPath}`
        )
      );
    }
  }
}

module.exports = { getGoogleFilesByEnv, copyFirebaseLibModules };
