const chalk = require("chalk");
const { groupFeatures } = require("../features/registry");
const { loadProject } = require("./load-project");

const ID_WIDTH = 14;

function printFeature(marker, color, feature) {
  console.log(
    `  ${color(marker)} ${chalk.bold(feature.id.padEnd(ID_WIDTH))}${chalk.gray(
      feature.description
    )}`
  );
  if (feature.unavailableReason) {
    console.log(`    ${" ".repeat(ID_WIDTH)}${chalk.dim(feature.unavailableReason)}`);
  }
}

function printSection(title, marker, color, features) {
  if (features.length === 0) {
    return;
  }
  console.log(chalk.bold.cyan(`\n${title}`));
  for (const feature of features) {
    printFeature(marker, color, feature);
  }
}

async function featuresCommand(options = {}) {
  try {
    const { projectPath, manifest } = await loadProject(options);
    const config = manifest?.config || null;
    const grouped = groupFeatures(config);

    console.log(chalk.cyan.bold("\n🧩 Features"));

    if (!config) {
      console.log(
        chalk.gray(
          `   Catalog only - ${projectPath} has no create-rn-app manifest.\n`
        )
      );
      for (const feature of [
        ...grouped.installed,
        ...grouped.addable,
        ...grouped.unavailable,
      ]) {
        printFeature(" ", chalk.gray, feature);
      }
      console.log("");
      return;
    }

    console.log(chalk.gray(`   ${manifest.config.projectName}`));
    printSection("Installed", "✓", chalk.green, grouped.installed);
    printSection("Can be added", "+", chalk.yellow, grouped.addable);
    printSection(
      "Not available for an existing project",
      "−",
      chalk.red,
      grouped.unavailable
    );
    console.log("");
  } catch (error) {
    console.error(chalk.red(`\n❌ ${error.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { featuresCommand };
