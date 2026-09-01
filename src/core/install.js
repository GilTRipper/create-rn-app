const path = require("path");
const chalk = require("chalk");
const execa = require("execa");
const fs = require("fs-extra");

async function setupXcodeEnvLocal(projectPath) {
  const scriptPath = path.join(projectPath, "scripts", "setup-xcode-env.js");

  if (!(await fs.pathExists(scriptPath))) {
    return;
  }

  try {
    await execa("node", [scriptPath], {
      cwd: projectPath,
      stdio: "pipe",
    });
  } catch (error) {
    console.log(
      chalk.yellow(
        "⚠️  Could not auto-configure ios/.xcode.env.local for Xcode builds"
      )
    );
    if (error.stderr) {
      console.log(chalk.dim(String(error.stderr)));
    }
    console.log(
      chalk.gray("Run manually after install: pnpm setup:ios-env\n")
    );
  }
}

async function install(ctx) {
  const {
    projectPath,
    projectName,
    packageManager,
    skipInstall,
    skipGit,
    skipPods,
    autoYes,
  } = ctx.config;

  let dependenciesInstalled = false;

  if (!skipInstall) {
    console.log(
      chalk.cyan(`\n📦 Installing dependencies with ${packageManager}...\n`)
    );

    try {
      const installArgs =
        packageManager === "npm"
          ? ["install", "--legacy-peer-deps"]
          : ["install"];

      await execa(packageManager, installArgs, {
        cwd: projectPath,
        stdio: "inherit",
        shell: true,
      });
      console.log(chalk.green("\n✅ Dependencies installed successfully!\n"));
      dependenciesInstalled = true;
    } catch (error) {
      console.log(chalk.red("\n❌ Failed to install dependencies"));

      if (error.message) {
        console.log(chalk.dim(`Error: ${error.message}`));
      }

      console.log(
        chalk.yellow(`\nYou can install dependencies manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  ${packageManager} install\n`));
    }

    // Install pods for iOS only if dependencies were installed successfully
    if (dependenciesInstalled && process.platform === "darwin" && !skipPods) {
      let shouldInstallPods = autoYes;

      if (!autoYes) {
        const inquirer = require("inquirer");
        const { installPods } = await inquirer.prompt([
          {
            type: "confirm",
            name: "installPods",
            message: "Install iOS CocoaPods now?",
            default: true,
          },
        ]);
        shouldInstallPods = installPods;
      }

      if (shouldInstallPods) {
        console.log(chalk.cyan("\n📦 Installing iOS CocoaPods...\n"));
        try {
          await execa("pod", ["install"], {
            cwd: path.join(projectPath, "ios"),
            stdio: "inherit",
            shell: true,
          });
          console.log(
            chalk.green("\n✅ iOS CocoaPods installed successfully!\n")
          );
        } catch (error) {
          console.log(chalk.red("\n❌ Failed to install CocoaPods"));
          if (error.message) {
            console.log(chalk.dim(`Error: ${error.message}`));
          }
          console.log(
            chalk.yellow(`\nYou can install them manually later with:`)
          );
          console.log(chalk.cyan(`  cd ${projectName}/ios`));
          console.log(chalk.cyan(`  pod install\n`));
        }
      } else {
        console.log(chalk.yellow("\n⏭️  Skipping iOS CocoaPods installation"));
        console.log(chalk.gray("You can install them later with:"));
        console.log(chalk.cyan(`  cd ${projectName}/ios && pod install\n`));
      }
    } else if (!dependenciesInstalled && process.platform === "darwin") {
      console.log(
        chalk.yellow(
          "⚠️  Skipping iOS CocoaPods installation (dependencies not installed)\n"
        )
      );
    }
  }

  if (!skipGit) {
    console.log(chalk.cyan("\n📁 Initializing git repository...\n"));
    try {
      await execa("git", ["init"], { cwd: projectPath });
      await execa("git", ["add", "."], { cwd: projectPath });
      await execa(
        "git",
        ["commit", "-m", "Initial commit from @giltripper/create-rn-app"],
        { cwd: projectPath }
      );
      console.log(chalk.green("✅ Git repository initialized\n"));
    } catch (error) {
      console.log(chalk.red("❌ Failed to initialize git"));
      console.log(
        chalk.yellow(`\nYou can initialize git manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  git init`));
      console.log(chalk.cyan(`  git add .`));
      console.log(chalk.cyan(`  git commit -m "Initial commit"\n`));
    }
  }
}

module.exports = { install, setupXcodeEnvLocal };
