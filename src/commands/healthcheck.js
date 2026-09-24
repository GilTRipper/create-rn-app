const chalk = require("chalk");
const { compareWithManifest, isAdopted } = require("../manifest");
const { groupFeatures } = require("../features/registry");
const { compareVersions } = require("../shared/version");
const { loadProject, reportMissingManifest } = require("./load-project");
const cliPackageJson = require("../../package.json");

const MAX_LISTED_FILES = 10;

function printRow(label, value) {
  console.log(`  ${chalk.gray(label.padEnd(16))}${value}`);
}

function printVersions(manifest) {
  printRow(
    "Project",
    `${chalk.bold(manifest.config.projectName)} ${chalk.gray(
      `(${manifest.config.bundleIdentifier})`
    )}`
  );
  printRow(
    "Created with",
    `create-rn-app ${manifest.cliVersion}${
      isAdopted(manifest) ? chalk.gray(" (detected by adopt)") : ""
    }`
  );

  const drift = compareVersions(cliPackageJson.version, manifest.cliVersion);
  if (drift > 0) {
    printRow(
      "This CLI",
      `${cliPackageJson.version} ${chalk.yellow("(newer - an upgrade is available)")}`
    );
  } else if (drift < 0) {
    printRow(
      "This CLI",
      `${cliPackageJson.version} ${chalk.yellow(
        "(older than the project - update create-rn-app)"
      )}`
    );
  } else {
    printRow("This CLI", `${cliPackageJson.version} ${chalk.green("(up to date)")}`);
  }

  printRow("React Native", manifest.reactNative || chalk.gray("unknown"));
}

function printFeatures(config) {
  const grouped = groupFeatures(config);
  console.log(chalk.bold.cyan("\n  Features"));

  const installed = grouped.installed.map(feature => feature.id);
  console.log(
    `    ${chalk.green("✓")} ${
      installed.length > 0 ? installed.join(", ") : chalk.gray("none")
    }`
  );

  if (grouped.addable.length > 0) {
    console.log(
      `    ${chalk.yellow("+")} ${chalk.gray("can be added:")} ${grouped.addable
        .map(feature => feature.id)
        .join(", ")}`
    );
  }
  for (const feature of grouped.unavailable) {
    console.log(
      `    ${chalk.red("−")} ${feature.id} ${chalk.dim(
        `(${feature.unavailableReason})`
      )}`
    );
  }
}

function printFileList(marker, color, files) {
  for (const file of files.slice(0, MAX_LISTED_FILES)) {
    console.log(`      ${color(marker)} ${file}`);
  }
  if (files.length > MAX_LISTED_FILES) {
    console.log(
      chalk.gray(`      … and ${files.length - MAX_LISTED_FILES} more`)
    );
  }
}

function printFiles(comparison) {
  console.log(chalk.bold.cyan("\n  Template files"));
  console.log(
    `    ${comparison.tracked} tracked, ${comparison.changed.length} changed, ` +
      `${comparison.deleted.length} deleted`
  );

  printFileList("~", chalk.yellow, comparison.changed);
  printFileList("−", chalk.red, comparison.deleted);

  // The user's own files are never touched by an upgrade, but they can still
  // drift away from a template that moved underneath them - so they get said
  // out loud rather than silently ignored.
  if (comparison.added.length > 0) {
    console.log(
      chalk.gray(
        `\n    ${comparison.added.length} file(s) are yours, not from the template.`
      )
    );
    console.log(
      chalk.gray(
        "    An upgrade leaves them alone - check them yourself when the template moves."
      )
    );
  }
}

async function healthcheckCommand(options = {}) {
  try {
    const { projectPath, manifest } = await loadProject(options);

    if (!manifest) {
      reportMissingManifest(projectPath, options);
      process.exitCode = 1;
      return;
    }

    console.log(chalk.cyan.bold("\n🩺 Healthcheck\n"));
    printVersions(manifest);
    printFeatures(manifest.config);

    // An adopted project has no baseline to compare against, so there is
    // nothing truthful to say about which files changed.
    if (isAdopted(manifest)) {
      console.log(chalk.bold.cyan("\n  Template files"));
      console.log(
        chalk.gray(
          "    No baseline recorded - this project was adopted, not generated."
        )
      );
      console.log(
        chalk.gray(
          "    The first upgrade rebuilds one from a snapshot of the detected version."
        )
      );
    } else {
      printFiles(await compareWithManifest(projectPath, manifest));
    }
    console.log("");
  } catch (error) {
    console.error(chalk.red(`\n❌ ${error.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { healthcheckCommand };
