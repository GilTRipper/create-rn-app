const chalk = require("chalk");
const inquirer = require("inquirer");
const { inspectProject } = require("../adopt");
const {
  MANIFEST_FILENAME,
  readManifest,
  writeAdoptedManifest,
} = require("../manifest");
const { ensureAbsolutePath } = require("../shared/paths");
const { validateBundleIdentifier, validateNpmProjectName } = require("../cli-validate");
const versionMap = require("../adopt/version-map.json");

const LABEL_WIDTH = 18;
const VALUE_WIDTH = 26;

function show(label, value, evidence) {
  const printable =
    value === null || value === undefined || value === "" ? chalk.gray("—") : value;
  console.log(
    `  ${chalk.gray(label.padEnd(LABEL_WIDTH))}${String(printable).padEnd(VALUE_WIDTH)}${chalk.dim(
      evidence || ""
    )}`
  );
}

function describeMaps(maps) {
  return maps?.enabled ? maps.provider : null;
}

function describeFirebase(firebase) {
  if (!firebase?.enabled) {
    return null;
  }
  return firebase.modules.length > 0 ? firebase.modules.join(", ") : "app only";
}

function describeLocalization(localization) {
  if (!localization?.enabled) {
    return null;
  }
  const parts = [localization.defaultLanguage || "language unknown"];
  if (localization.withRemoteConfig) {
    parts.push("remote config");
  }
  return parts.join(", ");
}

function printFindings(inspection) {
  const { config, evidence } = inspection;

  console.log(chalk.bold.cyan("\n  Project"));
  show("Name", config.projectName, evidence.projectName);
  show("Bundle id", config.bundleIdentifier, evidence.bundleIdentifier);
  show("Display name", config.displayName, evidence.displayName);
  show("Package manager", config.packageManager, evidence.packageManager);

  console.log(chalk.bold.cyan("\n  Features"));
  show(
    "Environments",
    config.envSetupSelectedEnvs.join(", ") || null,
    evidence.envSetupSelectedEnvs
  );
  show("Navigation", config.navigationMode, evidence.navigationMode);
  show("Storage", config.zustandStorage || null, evidence.zustandStorage);
  show("Theme", config.theme || null, evidence.theme);
  show("Localization", describeLocalization(config.localization), evidence.localization);
  show("Firebase", describeFirebase(config.firebase), evidence.firebase);
  show("Maps", describeMaps(config.maps), evidence.maps);
  show("UI kit", config.uiKit.components.join(", ") || null, evidence.uiKit);
  show("Custom fonts", config.assets.fonts || null, evidence.assets);
}

function printVersion(version, forced) {
  console.log(chalk.bold.cyan("\n  Created with"));

  if (forced) {
    show("create-rn-app", forced, "given with --from");
    return;
  }

  const best = version.best;
  if (version.unreliable) {
    console.log(
      chalk.yellow(
        `  Could not recognise the version (best guess ${best?.version}, ` +
          `${best?.matched}/${best?.compared} fingerprint files matched).`
      )
    );
    console.log(
      chalk.gray(
        "  The project may be newer than this CLI, or not made by create-rn-app.\n" +
          "  Pass --from <version> if you know it."
      )
    );
    return;
  }

  show(
    "create-rn-app",
    best.version,
    `${best.matched}/${best.compared} fingerprint files matched, released ${best.releasedAt}`
  );

  if (version.ambiguous) {
    console.log(
      chalk.yellow(
        `  ${version.ambiguous.length} releases fit equally well: ` +
          `${version.ambiguous.map(entry => entry.version).join(", ")}`
      )
    );
  }
}

function printUnknown(unknown) {
  if (unknown.length === 0) {
    return;
  }
  console.log(
    chalk.gray(`\n  Could not determine: ${unknown.join(", ")}`)
  );
}

async function chooseVersion(version, options) {
  if (options.from) {
    if (!versionMap.versions[options.from]) {
      throw new Error(
        `Unknown version "${options.from}". Known: ${Object.keys(
          versionMap.versions
        ).join(", ")}`
      );
    }
    return options.from;
  }

  const needsChoice = version.ambiguous || version.unreliable;
  if (!needsChoice) {
    return version.best.version;
  }

  if (options.yes) {
    if (version.unreliable) {
      throw new Error(
        "Could not recognise the version, and --yes cannot guess. Pass --from <version>."
      );
    }
    return version.best.version;
  }

  const choices = (version.ambiguous || version.ranked.slice(0, 5)).map(entry => ({
    name: `${entry.version}  ${chalk.gray(
      `React Native ${entry.reactNative}, released ${entry.releasedAt}`
    )}`,
    value: entry.version,
  }));

  const { chosen } = await inquirer.prompt([
    {
      type: "list",
      name: "chosen",
      message: "Which version created this project?",
      choices,
    },
  ]);
  return chosen;
}

// Only fields a detector can plausibly get wrong are offered. Firebase, maps and
// the UI kit come straight out of package.json and the component files, so they
// are shown but not editable - a wrong answer there would mean the dependency
// itself is missing.
function editableFields(config) {
  return [
    {
      name: `Name (${config.projectName})`,
      value: "projectName",
    },
    {
      name: `Bundle id (${config.bundleIdentifier})`,
      value: "bundleIdentifier",
    },
    {
      name: `Display name (${config.displayName})`,
      value: "displayName",
    },
    {
      name: `Package manager (${config.packageManager})`,
      value: "packageManager",
    },
    {
      name: `Environments (${config.envSetupSelectedEnvs.join(", ") || "none"})`,
      value: "envSetupSelectedEnvs",
    },
    {
      name: `Navigation (${config.navigationMode})`,
      value: "navigationMode",
    },
    { name: `Storage (${config.zustandStorage})`, value: "zustandStorage" },
    { name: `Theme (${config.theme})`, value: "theme" },
  ];
}

function questionFor(field, config) {
  switch (field) {
    case "projectName":
      return {
        type: "input",
        name: field,
        message: "Project name:",
        default: config.projectName,
        validate: input => validateNpmProjectName(input) || true,
      };
    case "bundleIdentifier":
      return {
        type: "input",
        name: field,
        message: "Bundle identifier:",
        default: config.bundleIdentifier,
        validate: input => validateBundleIdentifier(input) || true,
      };
    case "displayName":
      return {
        type: "input",
        name: field,
        message: "Display name:",
        default: config.displayName,
      };
    case "packageManager":
      return {
        type: "list",
        name: field,
        message: "Package manager:",
        choices: ["npm", "yarn", "pnpm"],
        default: config.packageManager,
      };
    case "envSetupSelectedEnvs":
      return {
        type: "checkbox",
        name: field,
        message: "Environments (production is always implied):",
        choices: ["local", "development", "staging"].map(env => ({
          name: env,
          value: env,
          checked: config.envSetupSelectedEnvs.includes(env),
        })),
      };
    case "navigationMode":
      return {
        type: "list",
        name: field,
        message: "Navigation:",
        choices: ["none", "app-only", "with-auth"],
        default: config.navigationMode,
      };
    case "zustandStorage":
      return {
        type: "confirm",
        name: field,
        message: "Zustand storage?",
        default: config.zustandStorage,
      };
    case "theme":
      return {
        type: "confirm",
        name: field,
        message: "Theme support?",
        default: config.theme,
      };
    default:
      return null;
  }
}

async function correctFields(config) {
  const { fields } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "fields",
      message: "Which of these are wrong?",
      choices: editableFields(config),
    },
  ]);

  const corrected = { ...config };
  for (const field of fields) {
    const question = questionFor(field, corrected);
    if (question) {
      const answer = await inquirer.prompt([question]);
      corrected[field] = answer[field];
    }
  }
  return corrected;
}

async function confirmConfig(config, options) {
  if (options.yes) {
    return config;
  }

  let current = config;
  for (;;) {
    const { ok } = await inquirer.prompt([
      { type: "confirm", name: "ok", message: "Is this right?", default: true },
    ]);
    if (ok) {
      return current;
    }
    current = await correctFields(current);
    console.log("");
    printFindings({ config: current, evidence: {} });
  }
}

async function adoptCommand(options = {}) {
  try {
    const projectPath = ensureAbsolutePath(options.path || process.cwd());

    const existing = await readManifest(projectPath);
    if (existing && !options.force) {
      console.log(
        chalk.yellow(`\n⚠️  ${projectPath} already has ${MANIFEST_FILENAME}.`)
      );
      console.log(
        chalk.gray(
          existing.adopted
            ? "  It was adopted before. Pass --force to redo it.\n"
            : "  It was generated by create-rn-app, so there is nothing to adopt.\n"
        )
      );
      process.exitCode = 1;
      return;
    }

    console.log(chalk.cyan.bold("\n🧬 Adopt\n"));
    console.log(chalk.gray(`  ${projectPath}`));

    const inspection = await inspectProject(projectPath);
    printFindings(inspection);
    printVersion(inspection.version, options.from);
    printUnknown(inspection.unknown);
    console.log("");

    const cliVersion = await chooseVersion(inspection.version, options);
    const config = await confirmConfig(inspection.config, options);

    const manifest = await writeAdoptedManifest(projectPath, {
      cliVersion,
      reactNative: inspection.reactNative,
      config,
    });

    console.log(chalk.green.bold(`\n✅ Wrote ${MANIFEST_FILENAME}\n`));
    console.log(
      chalk.white(
        `  The project is now tracked as created with create-rn-app ${manifest.cliVersion}.`
      )
    );
    console.log(
      chalk.gray(
        "  No file baseline was recorded: there is no honest record of what the CLI\n" +
          "  originally generated, and inventing one would let a later upgrade\n" +
          "  overwrite your changes. The first upgrade rebuilds it from a snapshot.\n"
      )
    );
    console.log(chalk.cyan("  Next: create-rn-app healthcheck\n"));
  } catch (error) {
    console.error(chalk.red(`\n❌ ${error.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { adoptCommand };
