const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const inquirer = require("inquirer");
const { getFeature, listFeatures } = require("../features/registry");
const {
  MANIFEST_FILENAME,
  manifestPath,
  readManifest,
  isAdopted,
} = require("../manifest");
const { buildAddPlan, OUTCOMES, PACKAGE_JSON } = require("../add/plan");
const { applyDependencyChanges } = require("../add/deps");
const { workingTreeStatus } = require("../shared/git");
const { ensureAbsolutePath, resolveOptionalDir } = require("../shared/paths");
const { hashProjectFiles } = require("../manifest/hash");
const { resolveIconSources } = require("../features/assets/icon-sources");
const { loadProject, reportMissingManifest } = require("./load-project");
const cliPackageJson = require("../../package.json");

const MARKS = {
  [OUTCOMES.CREATE]: { mark: "+", color: chalk.green, label: "new file" },
  [OUTCOMES.MERGED]: { mark: "~", color: chalk.cyan, label: "merged" },
  [OUTCOMES.CONFLICT]: { mark: "!", color: chalk.yellow, label: "needs you" },
  [OUTCOMES.ALREADY]: { mark: "=", color: chalk.gray, label: "already applied" },
  [OUTCOMES.OCCUPIED]: { mark: "!", color: chalk.yellow, label: "path taken" },
  [OUTCOMES.DROPPED]: { mark: "-", color: chalk.gray, label: "no longer shipped" },
};

function resolveFeature(name) {
  const feature = getFeature(name);
  if (!feature) {
    const known = listFeatures()
      .filter(entry => entry.meta.addable)
      .map(entry => entry.meta.id)
      .join(", ");
    throw new Error(`Unknown feature "${name}". Addable: ${known}`);
  }
  if (!feature.meta.addable) {
    throw new Error(
      `"${name}" cannot be added to an existing project: ${feature.meta.unavailableReason}`
    );
  }
  return feature;
}

// The feature's own questions, asked against the config the project already
// has, so answers that depend on other features stay consistent.
//
// --yes cannot go through the prompts: during generation it means "leave every
// optional feature off", which for `add` would be the one thing the user did
// not ask for. Features that can be switched on unattended expose enable().
async function collectAnswers(feature, config, options) {
  const config0 = JSON.parse(JSON.stringify(config));

  if (options.yes) {
    if (typeof feature.enable !== "function") {
      throw new Error(
        `${feature.meta.title} needs answers that have no sensible default. Run it without --yes.`
      );
    }
    return feature.enable(config0);
  }

  const ctx = { options: { yes: false }, questions: [], config: config0 };
  await feature.prompt(ctx);
  return ctx.config;
}

function printPlan(plan) {
  console.log(chalk.bold.cyan("\n  Files"));

  if (plan.files.length === 0) {
    console.log(chalk.gray("    nothing to change"));
  }
  for (const item of plan.files) {
    const style = MARKS[item.outcome];
    const suffix =
      item.outcome === OUTCOMES.CONFLICT ? ` (${item.conflicts} conflicts)` : "";
    console.log(
      `    ${style.color(style.mark)} ${item.path.padEnd(38)}${chalk.dim(
        style.label + suffix
      )}`
    );
  }

  const { apply, conflicts, removals } = plan.dependencies;
  const additions = Object.entries(apply).flatMap(([section, entries]) =>
    Object.entries(entries).map(([name, version]) => `${name}@${version}`)
  );

  if (additions.length > 0 || conflicts.length > 0 || removals.length > 0) {
    console.log(chalk.bold.cyan("\n  Dependencies"));
    for (const dependency of additions) {
      console.log(`    ${chalk.green("+")} ${dependency}`);
    }
    for (const conflict of conflicts) {
      console.log(
        `    ${chalk.yellow("!")} ${conflict.name} ${chalk.dim(
          `you have ${conflict.project}, the feature wants ${conflict.wanted} - keeping yours`
        )}`
      );
    }
    for (const removal of removals) {
      console.log(
        `    ${chalk.gray("=")} ${removal.name} ${chalk.dim(
          "no longer needed by the template - left in place"
        )}`
      );
    }
  }

  if (plan.xcode.length > 0) {
    console.log(chalk.bold.cyan("\n  Xcode"));
    console.log(
      chalk.gray(
        "    Project files cannot be compared between generations - check them yourself:"
      )
    );
    for (const filePath of plan.xcode) {
      console.log(chalk.dim(`      ${filePath}`));
    }
  }
}

async function resolveConflict(item, options) {
  if (options.yes) {
    return "merge";
  }

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: `${item.path} could not be merged cleanly (${item.conflicts} conflicts).`,
      choices: [
        { name: "write it with conflict markers to resolve in your editor", value: "merge" },
        { name: "keep my version, save the template's next to it", value: "keep" },
        { name: "take the template's version, losing my changes", value: "theirs" },
      ],
    },
  ]);
  return choice;
}

async function writeFiles(plan, projectPath, options) {
  const written = [];
  const leftovers = [];

  for (const item of plan.files) {
    const target = path.join(projectPath, item.path);

    if (item.outcome === OUTCOMES.CREATE || item.outcome === OUTCOMES.MERGED) {
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, item.content, "utf8");
      written.push(item.path);
      continue;
    }

    if (item.outcome === OUTCOMES.CONFLICT || item.outcome === OUTCOMES.OCCUPIED) {
      const choice =
        item.outcome === OUTCOMES.OCCUPIED
          ? "keep"
          : await resolveConflict(item, options);

      if (choice === "merge") {
        await fs.writeFile(target, item.content, "utf8");
        written.push(item.path);
      } else if (choice === "theirs") {
        await fs.writeFile(target, item.theirs ?? item.content, "utf8");
        written.push(item.path);
      } else {
        const sidecar = `${target}.new`;
        await fs.writeFile(sidecar, item.theirs ?? item.content, "utf8");
        leftovers.push(`${item.path}.new`);
      }
    }
  }

  return { written, leftovers };
}

async function updateManifest(projectPath, manifest, nextConfig, baselineUpdates) {
  const updated = {
    ...manifest,
    cliVersion: manifest.cliVersion,
    config: nextConfig,
  };

  // An adopted project has no baseline map. It gains one entry per file the
  // CLI has now actually written, and stays adopted for everything else.
  if (manifest.files || !isAdopted(manifest)) {
    updated.files = { ...(manifest.files || {}) };
    for (const [filePath, hash] of Object.entries(baselineUpdates)) {
      if (hash) {
        updated.files[filePath] = hash;
      }
    }
    updated.files = Object.fromEntries(
      Object.keys(updated.files)
        .sort()
        .map(key => [key, updated.files[key]])
    );
  }

  updated.lastChangedBy = cliPackageJson.version;
  updated.lastChangedAt = new Date().toISOString();

  await fs.writeJson(manifestPath(projectPath), updated, { spaces: 2 });
}

// Assets are copied straight into the project: their sources are local paths
// that no snapshot can reproduce. The config carries the directories for this
// one run only; the manifest records that custom assets exist, never where
// they came from.
function assetConfigFrom(options, config) {
  const fontsDir = resolveOptionalDir(options.fontsDir);
  const splashScreenDir = resolveOptionalDir(options.splashDir);
  const appIconDir = resolveOptionalDir(options.appIconDir);

  if (!fontsDir && !splashScreenDir && !appIconDir) {
    throw new Error(
      "Nothing to add. Pass at least one of --fonts-dir, --splash-dir, --app-icon-dir."
    );
  }

  return {
    ...config,
    fontsDir,
    splashScreenDir,
    appIconDir,
    assets: {
      fonts: Boolean(fontsDir) || Boolean(config.assets?.fonts),
      splashScreen: Boolean(splashScreenDir) || config.assets?.splashScreen === true,
      appIcon: Boolean(appIconDir) || config.assets?.appIcon === true,
    },
  };
}

async function describeAssets(nextConfig) {
  console.log(chalk.bold.cyan("\n  Assets"));

  for (const [label, dir] of [
    ["fonts", nextConfig.fontsDir],
    ["splash screen", nextConfig.splashScreenDir],
    ["app icons", nextConfig.appIconDir],
  ]) {
    if (dir) {
      console.log(`    ${chalk.green("+")} ${label.padEnd(16)}${chalk.dim(dir)}`);
    }
  }

  if (!nextConfig.appIconDir) {
    return;
  }

  const sources = await resolveIconSources(
    nextConfig.appIconDir,
    nextConfig.envSetupSelectedEnvs || []
  );
  if (sources.shared) {
    console.log(chalk.dim("      shared set for every environment"));
  }
  for (const env of Object.keys(sources.byEnv)) {
    console.log(chalk.dim(`      ${env}: its own icon set`));
  }
  for (const name of sources.unmatched) {
    console.log(
      chalk.yellow(`      ${name}/ matches no environment and will be ignored`)
    );
  }
}

// Whatever the direct apply wrote is, by definition, this CLI's own output for
// the given sources, so it becomes the new baseline.
async function refreshBaselines(projectPath, manifest) {
  if (!manifest.files) {
    return {};
  }

  const current = await hashProjectFiles(projectPath);
  const updates = {};
  for (const [filePath, hash] of Object.entries(current)) {
    if (manifest.files[filePath] !== hash) {
      updates[filePath] = hash;
    }
  }
  return updates;
}

async function addAssets(feature, projectPath, manifest, options) {
  const nextConfig = assetConfigFrom(options, manifest.config);

  console.log(chalk.cyan.bold(`\n🧩 Add ${feature.meta.title}\n`));
  console.log(chalk.gray(`  ${projectPath}`));
  await describeAssets(nextConfig);

  if (options.dryRun) {
    console.log(chalk.gray("\n  --dry-run: nothing was written.\n"));
    return;
  }

  await feature.applyDirect({ config: { ...nextConfig, projectPath } });

  const baselineUpdates = await refreshBaselines(projectPath, manifest);
  // The source directories belong to this machine and never reach the manifest.
  const { fontsDir, splashScreenDir, appIconDir, ...recorded } = nextConfig;
  await updateManifest(projectPath, manifest, recorded, baselineUpdates);

  console.log(chalk.green.bold("\n✅ Assets copied\n"));
  console.log(
    chalk.gray("  Undo everything with: git checkout -- . && git clean -fd\n")
  );
}

async function addCommand(featureName, options = {}) {
  try {
    const projectPath = ensureAbsolutePath(options.path || process.cwd());
    const { manifest } = await loadProject({ path: projectPath });

    if (!manifest) {
      reportMissingManifest(projectPath, options);
      process.exitCode = 1;
      return;
    }

    const feature = resolveFeature(featureName);

    // Assets are cumulative - fonts today, icons next month - so "already
    // installed" is not a reason to refuse them.
    if (!feature.applyDirect && feature.isInstalled(manifest.config)) {
      console.log(
        chalk.yellow(`\n⚠️  ${feature.meta.title} is already set up here.\n`)
      );
      process.exitCode = 1;
      return;
    }

    if (!options.dryRun) {
      const status = workingTreeStatus(projectPath);
      if (!status.repository) {
        throw new Error(
          "This is not a git repository. `add` needs one so its changes can be undone."
        );
      }
      if (!status.clean) {
        throw new Error(
          `Commit or stash your changes first - ${status.changes.length} file(s) are dirty.`
        );
      }
    }

    if (typeof feature.applyDirect === "function") {
      await addAssets(feature, projectPath, manifest, options);
      return;
    }

    console.log(chalk.cyan.bold(`\n🧩 Add ${feature.meta.title}\n`));
    console.log(chalk.gray(`  ${projectPath}`));

    const nextConfig = await collectAnswers(feature, manifest.config, options);
    if (!feature.isInstalled(nextConfig)) {
      console.log(chalk.yellow("\n⏭️  Nothing selected, leaving the project alone.\n"));
      return;
    }

    const plan = await buildAddPlan({
      projectPath,
      currentConfig: manifest.config,
      nextConfig,
      labels: {
        ours: "your version",
        base: "before",
        theirs: `create-rn-app ${feature.meta.id}`,
      },
    });

    printPlan(plan);

    if (options.dryRun) {
      console.log(chalk.gray("\n  --dry-run: nothing was written.\n"));
      return;
    }

    const { written, leftovers } = await writeFiles(plan, projectPath, options);

    const dependencyCount = Object.values(plan.dependencies.apply).reduce(
      (total, entries) => total + Object.keys(entries).length,
      0
    );
    if (dependencyCount > 0) {
      const packageJsonPath = path.join(projectPath, PACKAGE_JSON);
      await fs.writeJson(
        packageJsonPath,
        applyDependencyChanges(
          await fs.readJson(packageJsonPath),
          plan.dependencies.apply
        ),
        { spaces: 2 }
      );
    }

    // Steps that cannot be expressed as file content, because they rewrite
    // something carrying this project's own generated ids. The feature's own
    // code does it, against the real project.
    if (typeof feature.applyNative === "function") {
      await feature.applyNative({ config: { ...nextConfig, projectPath } });
    }

    await updateManifest(projectPath, manifest, nextConfig, plan.baselineUpdates);

    console.log(
      chalk.green.bold(`\n✅ ${feature.meta.title} added — ${written.length} file(s) written\n`)
    );
    for (const leftover of leftovers) {
      console.log(chalk.yellow(`  Kept your version; the template's is at ${leftover}`));
    }
    if (feature.postAddNote) {
      console.log(chalk.yellow(`  ${feature.postAddNote}`));
    }
    if (dependencyCount > 0) {
      console.log(
        chalk.cyan(`  Next: ${manifest.config.packageManager} install`)
      );
    }
    console.log(
      chalk.gray(`  Undo everything with: git checkout -- . && git clean -fd\n`)
    );
  } catch (error) {
    console.error(chalk.red(`\n❌ ${error.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { addCommand };
