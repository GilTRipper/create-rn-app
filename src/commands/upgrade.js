const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const inquirer = require("inquirer");
const { buildUpgradePlan, OUTCOMES } = require("../upgrade/plan");
const {
  printPackageJsonPlan,
  applyPackageJsonLane,
} = require("../upgrade/package-json-apply");
const { manifestPath, isAdopted } = require("../manifest");
const { compareVersions } = require("../shared/version");
const { workingTreeStatus } = require("../shared/git");
const { ensureAbsolutePath } = require("../shared/paths");
const { loadProject, reportMissingManifest } = require("./load-project");
const cliPackageJson = require("../../package.json");

const STYLE = {
  [OUTCOMES.CREATE]: { mark: "+", color: chalk.green, label: "new from the template" },
  [OUTCOMES.OVERWRITE]: { mark: "↑", color: chalk.green, label: "updated, you never touched it" },
  [OUTCOMES.MERGED]: { mark: "~", color: chalk.cyan, label: "merged with your changes" },
  [OUTCOMES.CONFLICT]: { mark: "!", color: chalk.yellow, label: "needs you" },
  [OUTCOMES.RESTORE]: { mark: "?", color: chalk.yellow, label: "you deleted it, the template still ships it" },
  [OUTCOMES.COLLISION]: { mark: "?", color: chalk.yellow, label: "no baseline to merge from" },
  [OUTCOMES.USER_OWNED]: { mark: "·", color: chalk.gray, label: "yours, left alone" },
  [OUTCOMES.REMOVED]: { mark: "·", color: chalk.gray, label: "template dropped it, kept anyway" },
};

const ASKS = new Set([OUTCOMES.CONFLICT, OUTCOMES.RESTORE, OUTCOMES.COLLISION]);
const WRITES_SILENTLY = new Set([OUTCOMES.CREATE, OUTCOMES.OVERWRITE, OUTCOMES.MERGED]);

function printPlan(plan, manifest, options) {
  console.log(chalk.bold.cyan("\n  Versions"));
  console.log(
    `    ${chalk.gray("create-rn-app".padEnd(16))}${manifest.cliVersion} → ${chalk.bold(
      cliPackageJson.version
    )}`
  );
  if (plan.reactNative && plan.reactNative !== manifest.reactNative) {
    console.log(
      `    ${chalk.gray("react-native".padEnd(16))}${manifest.reactNative} → ${chalk.bold(
        plan.reactNative
      )}`
    );
  }

  const groups = new Map();
  for (const item of plan.files) {
    if (!groups.has(item.outcome)) {
      groups.set(item.outcome, []);
    }
    groups.get(item.outcome).push(item);
  }

  console.log(chalk.bold.cyan("\n  Files"));
  if (plan.files.length === 0) {
    console.log(chalk.gray("    nothing to change"));
  }
  for (const [outcome, items] of groups) {
    const style = STYLE[outcome];
    for (const item of items) {
      const suffix =
        item.outcome === OUTCOMES.CONFLICT ? ` (${item.conflicts} conflicts)` : "";
      // A long path would otherwise run straight into its own label.
      const gap = item.path.length >= 46 ? "\n" + " ".repeat(52) : "";
      console.log(
        `    ${style.color(style.mark)} ${item.path.padEnd(46)}${gap}${chalk.dim(
          style.label + suffix
        )}`
      );
    }
  }

  printPackageJsonPlan(plan.dependencies, options);

  if (plan.xcode.length > 0) {
    console.log(chalk.bold.cyan("\n  Xcode"));
    console.log(
      chalk.gray(
        "    The template changed the project file. It carries your own object ids,\n" +
          "    so it cannot be written from a snapshot - open it and compare yourself:"
      )
    );
    plan.xcode.forEach(filePath => console.log(chalk.dim(`      ${filePath}`)));
  }
}

async function askAbout(item, options) {
  if (options.yes) {
    return item.outcome === OUTCOMES.CONFLICT ? "merge" : "skip";
  }

  const choices =
    item.outcome === OUTCOMES.CONFLICT
      ? [
          { name: "write it with conflict markers to resolve in your editor", value: "merge" },
          { name: "keep mine, save the template's alongside as .new", value: "keep" },
          { name: "take the template's version, losing my changes", value: "theirs" },
        ]
      : [
          { name: "leave it alone", value: "skip" },
          { name: "write the template's version", value: "theirs" },
          { name: "save the template's version alongside as .new", value: "keep" },
        ];

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: `${item.path}: ${STYLE[item.outcome].label}`,
      choices,
    },
  ]);
  return choice;
}

async function applyPlan(plan, projectPath, options) {
  const written = [];
  const leftovers = [];
  const skipped = [];

  for (const item of plan.files) {
    const target = path.join(projectPath, item.path);

    if (WRITES_SILENTLY.has(item.outcome)) {
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, item.content, "utf8");
      written.push(item.path);
      continue;
    }

    if (!ASKS.has(item.outcome)) {
      continue; // user-owned or dropped by the template: never touched.
    }

    const choice = await askAbout(item, options);
    if (choice === "merge" || choice === "theirs") {
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(
        target,
        choice === "theirs" ? item.theirs ?? item.content : item.content,
        "utf8"
      );
      written.push(item.path);
    } else if (choice === "keep") {
      await fs.writeFile(`${target}.new`, item.theirs ?? item.content, "utf8");
      leftovers.push(`${item.path}.new`);
    } else {
      skipped.push(item.path);
    }
  }

  return { written, leftovers, skipped };
}

// The baseline becomes what a clean generation at the new version produces -
// never what ended up on disk. A file whose own version the user kept has to
// stay marked as diverged, or the next upgrade would overwrite it in silence.
async function updateManifest(projectPath, manifest, plan) {
  const updated = {
    ...manifest,
    cliVersion: cliPackageJson.version,
    reactNative: plan.reactNative || manifest.reactNative,
    files: Object.fromEntries(
      Object.keys(plan.baselineUpdates)
        .sort()
        .map(key => [key, plan.baselineUpdates[key]])
    ),
    lastChangedBy: cliPackageJson.version,
    lastChangedAt: new Date().toISOString(),
  };

  // The project now has a real baseline, so it is no longer merely adopted.
  delete updated.adopted;
  delete updated.adoptedAt;

  await fs.writeJson(manifestPath(projectPath), updated, { spaces: 2 });
}

async function upgradeCommand(options = {}) {
  try {
    const projectPath = ensureAbsolutePath(options.path || process.cwd());
    const { manifest } = await loadProject({ path: projectPath });

    if (!manifest) {
      reportMissingManifest(projectPath, options);
      process.exitCode = 1;
      return;
    }

    const drift = compareVersions(cliPackageJson.version, manifest.cliVersion);
    if (drift === 0) {
      console.log(
        chalk.green(`\n✅ Already on create-rn-app ${manifest.cliVersion}.\n`)
      );
      return;
    }
    if (drift < 0) {
      throw new Error(
        `This project was made with create-rn-app ${manifest.cliVersion}, newer than the ${cliPackageJson.version} you are running. Update the CLI first.`
      );
    }

    if (!options.dryRun) {
      const status = workingTreeStatus(projectPath);
      if (!status.repository) {
        throw new Error(
          "This is not a git repository. `upgrade` needs one so its changes can be undone."
        );
      }
      if (!status.clean) {
        throw new Error(
          `Commit or stash your changes first - ${status.changes.length} file(s) are dirty.`
        );
      }
    }

    console.log(chalk.cyan.bold("\n⬆️  Upgrade\n"));
    console.log(chalk.gray(`  ${projectPath}`));

    if (isAdopted(manifest)) {
      console.log(
        chalk.yellow(
          "\n  This project was adopted, so there is no record of what the CLI\n" +
            "  originally generated. Every file the template changed has to be\n" +
            "  decided by you this once; afterwards it upgrades like any other."
        )
      );
    }

    const plan = await buildUpgradePlan({
      projectPath,
      manifest,
      onDownload: version =>
        console.log(
          chalk.gray(`\n  Fetching create-rn-app ${version} to compare against…`)
        ),
    });

    printPlan(plan, manifest, options);

    if (options.dryRun) {
      console.log(chalk.gray("\n  --dry-run: nothing was written.\n"));
      return;
    }

    const { written, leftovers, skipped } = await applyPlan(plan, projectPath, options);

    const packageJson = await applyPackageJsonLane(plan.dependencies, projectPath, options);

    await updateManifest(projectPath, manifest, plan);

    console.log(
      chalk.green.bold(
        `\n✅ Upgraded to create-rn-app ${cliPackageJson.version} — ${written.length} file(s) written\n`
      )
    );
    leftovers.forEach(file =>
      console.log(chalk.yellow(`  Kept yours; the template's is at ${file}`))
    );
    skipped.forEach(file => console.log(chalk.gray(`  Left alone: ${file}`)));
    packageJson.notes.forEach(note => console.log(chalk.yellow(`  ${note}`)));
    console.log(chalk.cyan(`\n  Next: ${manifest.config.packageManager} install`));
    if (process.platform === "darwin") {
      console.log(chalk.cyan("        cd ios && pod install"));
    }
    console.log(
      chalk.gray("\n  Undo everything with: git checkout -- . && git clean -fd\n")
    );
  } catch (error) {
    console.error(chalk.red(`\n❌ ${error.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { upgradeCommand };
