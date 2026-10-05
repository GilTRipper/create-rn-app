const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const inquirer = require("inquirer");
const { applyPackageJsonPlan, hasPackageJsonChanges } = require("./package-json");

const PACKAGE_JSON = "package.json";

function line(mark, color, subject, note) {
  console.log(`    ${color(mark)} ${subject} ${chalk.dim(note)}`);
}

function printDependencies(plan, options) {
  for (const [, entries] of Object.entries(plan.apply)) {
    for (const [name, version] of Object.entries(entries)) {
      line("↑", chalk.green, `${name}@${version}`, "");
    }
  }
  for (const move of plan.moves.apply) {
    line("⇄", chalk.green, move.name, `${move.from} → ${move.to}`);
  }
  for (const conflict of plan.conflicts) {
    line(
      "!",
      chalk.yellow,
      conflict.name,
      `you pinned ${conflict.project}, the template moved to ${conflict.wanted} - keeping yours`
    );
  }
  for (const move of plan.moves.conflicts) {
    line(
      "!",
      chalk.yellow,
      move.name,
      `the template moved it to ${move.to}, you changed it to ${move.project} - left in ${move.from}`
    );
  }
  for (const removal of plan.removals) {
    line(
      "?",
      chalk.yellow,
      `${removal.name}@${removal.version}`,
      options.yes
        ? "template dropped it - kept (-y), remove it yourself if unused"
        : "template dropped it - you will be asked"
    );
  }
}

function printFields(plan) {
  for (const [field, change] of Object.entries(plan.fields)) {
    for (const [key, value] of Object.entries(change.set)) {
      line("↑", chalk.green, `${field}.${key}`, value);
    }
    for (const key of change.remove) {
      line("−", chalk.green, `${field}.${key}`, "template dropped it");
    }
    for (const conflict of change.conflicts) {
      line(
        "!",
        chalk.yellow,
        `${field}.${conflict.key}`,
        conflict.wanted === null
          ? "template dropped it, you changed it - keeping yours"
          : `you have "${conflict.project}", the template wants "${conflict.wanted}" - keeping yours`
      );
    }
  }
}

function describePatchChange(item) {
  if (!item.to) {
    return `${item.from.key} → removed`;
  }
  if (!item.from) {
    return `+ ${item.to.key}`;
  }
  return item.from.key === item.to.key
    ? `${item.to.key} rewritten`
    : `${item.from.key} → ${item.to.key}`;
}

function printPatches(plan, options) {
  for (const item of plan.patches) {
    if (item.action === "add" || item.action === "replace") {
      line("↻", chalk.green, item.name, describePatchChange(item));
    } else if (item.action === "ask") {
      line(
        "?",
        chalk.yellow,
        item.name,
        `${describePatchChange(item)} - you edited this patch, ${
          options.yes
            ? "replacing it (-y)"
            : "you will be asked; keeping it keeps the package at its current version"
        }`
      );
    } else if (item.action === "pinned") {
      line("·", chalk.gray, item.name, "kept with the version you pinned");
    } else if (item.action === "own" && item.to) {
      line(
        "!",
        chalk.yellow,
        item.name,
        `your own patch ${item.from.key} kept, the template now ships ${item.to.key}`
      );
    }
  }
}

function printPackageJsonPlan(plan, options = {}) {
  const hasAnything =
    hasPackageJsonChanges(plan) ||
    plan.conflicts.length > 0 ||
    plan.moves.conflicts.length > 0 ||
    plan.patches.length > 0 ||
    Object.values(plan.fields).some(change => change.conflicts.length > 0);
  if (!hasAnything) {
    return;
  }

  console.log(chalk.bold.cyan("\n  package.json"));
  printDependencies(plan, options);
  printFields(plan);
  printPatches(plan, options);
}

async function confirm(message, defaultValue) {
  const { answer } = await inquirer.prompt([
    { type: "confirm", name: "answer", message, default: defaultValue },
  ]);
  return answer;
}

// -y keeps a dropped dependency: unlike a file, it may be imported by the
// team's own code, and removing it would only surface as a broken build.
async function decideRemovals(plan, options) {
  const removePackages = [];
  for (const removal of plan.removals) {
    if (options.yes) {
      continue;
    }
    const remove = await confirm(
      `${removal.name}@${removal.version}: the template no longer ships it. Remove it?`,
      true
    );
    if (remove) {
      removePackages.push(removal);
    }
  }
  return removePackages;
}

// A patch and its package move together. Declining the new patch keeps the old
// version too - otherwise the old patch would point at a version that is gone
// and the install would fail.
async function decidePatches(plan, removePackages, options) {
  const removed = new Set(removePackages.map(removal => removal.name));
  const accepted = [];
  const keepPackages = new Set();
  const replacedEdited = [];
  const keptEdited = [];

  for (const item of plan.patches) {
    if (item.followsRemoval) {
      if (removed.has(item.name)) {
        accepted.push(item);
      }
      continue;
    }
    if (item.action === "add" || item.action === "replace") {
      accepted.push(item);
      continue;
    }
    if (item.action !== "ask") {
      continue;
    }

    const replace =
      options.yes ||
      (await confirm(
        `${item.name}: you edited ${item.from.file}, the template ${
          item.to ? `ships ${item.to.key}` : "dropped it"
        }. Replace it with the template's? (your version stays in git)`,
        true
      ));
    if (replace) {
      accepted.push(item);
      replacedEdited.push(item);
    } else {
      keepPackages.add(item.name);
      keptEdited.push(item);
    }
  }

  return { accepted, keepPackages, replacedEdited, keptEdited };
}

async function writePatchFiles(accepted, projectPath, patchContents) {
  for (const item of accepted) {
    if (item.from && (!item.to || item.to.file !== item.from.file)) {
      await fs.remove(path.join(projectPath, item.from.file));
    }
    if (item.to) {
      const target = path.join(projectPath, item.to.file);
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, patchContents[item.to.file], "utf8");
    }
  }
}

async function applyPackageJsonLane(plan, projectPath, options = {}) {
  if (!hasPackageJsonChanges(plan)) {
    return { changed: false, notes: [] };
  }

  const removePackages = await decideRemovals(plan, options);
  const patches = await decidePatches(plan, removePackages, options);

  const packageJsonPath = path.join(projectPath, PACKAGE_JSON);
  const before = await fs.readJson(packageJsonPath);
  const after = applyPackageJsonPlan(before, plan, {
    keepPackages: patches.keepPackages,
    removePackages,
    patches: patches.accepted,
  });
  await fs.writeJson(packageJsonPath, after, { spaces: 2 });
  await writePatchFiles(patches.accepted, projectPath, plan.patchContents || {});

  const notes = [
    ...patches.replacedEdited.map(
      item =>
        `${item.to ? "Replaced" : "Removed"} your edited ${item.from.file} - your version is in git`
    ),
    ...patches.keptEdited.map(
      item => `Kept ${item.name} at ${before.dependencies?.[item.name] ??
        before.devDependencies?.[item.name]} with your patch ${item.from.file}`
    ),
    ...plan.removals
      .filter(removal => !removePackages.includes(removal))
      .map(removal => `Kept ${removal.name}, which the template no longer ships`),
  ];

  return { changed: JSON.stringify(before) !== JSON.stringify(after), notes };
}

module.exports = { printPackageJsonPlan, applyPackageJsonLane };
