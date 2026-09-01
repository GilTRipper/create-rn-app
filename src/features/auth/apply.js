const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

async function copyAuthTemplate(projectPath) {
  const sourceAuthPath = path.join(TEMPLATE_PRESETS, "auth");

  // Check if source directory exists
  if (!(await fs.pathExists(sourceAuthPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Auth template directory not found: ${sourceAuthPath}. Skipping auth template copy.`
      )
    );
    return;
  }

  const targetAuthPath = path.join(projectPath, "src/auth");
  await fs.ensureDir(path.dirname(targetAuthPath));

  if (await fs.pathExists(sourceAuthPath)) {
    await fs.copy(sourceAuthPath, targetAuthPath, {
      overwrite: true,
    });
    console.log(chalk.green("✅ Copied auth template"));
  } else {
    console.log(
      chalk.yellow(`⚠️  Auth source directory not found: ${sourceAuthPath}`)
    );
  }
}

async function apply(ctx) {
  if (ctx.config.navigationMode !== "with-auth") {
    return;
  }
  await copyAuthTemplate(ctx.config.projectPath);
}

module.exports = { apply, copyAuthTemplate };
