const fs = require("fs-extra");
const path = require("path");
const { buildSnapshot } = require("../snapshot");
const { hashProjectFiles } = require("../manifest/hash");
const { classifyAll, ACTIONS } = require("../merge/classify");
const { mergeThreeWay } = require("../merge/three-way");
const { diffDependencies, planDependencyChanges } = require("../add/deps");
const { loadCreateApp } = require("./old-version");

const PACKAGE_JSON = "package.json";

const OUTCOMES = {
  CREATE: "create",
  OVERWRITE: "overwrite",
  MERGED: "merged",
  CONFLICT: "conflict",
  USER_OWNED: "user-owned",
  REMOVED: "removed-from-template",
  RESTORE: "deleted-by-you",
  COLLISION: "no-baseline",
};

const NEEDS_BASE = new Set([ACTIONS.MERGE]);

// package.json never goes through the text lane: by upgrade time it is full of
// the team's own dependencies, and a line merge would fight them for no reason.
//
// Xcode project files are excluded too. They are absent from a snapshot on
// purpose - their object ids are this project's own - so the classifier would
// call them the user's work and say "left alone", which reads as a decision
// rather than the limitation it is. The Xcode section reports them instead.
const XCODE_GENERATED = /\.(pbxproj|xcscheme)$/;

function actionable(classified) {
  return Object.entries(classified).filter(
    ([filePath, result]) =>
      filePath !== PACKAGE_JSON &&
      !XCODE_GENERATED.test(filePath) &&
      result.action !== ACTIONS.SKIP_UNCHANGED &&
      result.action !== ACTIONS.SKIP_GONE
  );
}

async function planFile(filePath, result, { projectPath, base, theirs, labels }) {
  const target = path.join(projectPath, filePath);

  switch (result.action) {
    case ACTIONS.SKIP_USER_OWNED:
      return { path: filePath, outcome: OUTCOMES.USER_OWNED };

    case ACTIONS.REPORT_REMOVED:
      return { path: filePath, outcome: OUTCOMES.REMOVED };

    case ACTIONS.ADD:
      return {
        path: filePath,
        outcome: OUTCOMES.CREATE,
        content: await theirs.read(filePath),
      };

    case ACTIONS.OVERWRITE:
      return {
        path: filePath,
        outcome: OUTCOMES.OVERWRITE,
        content: await theirs.read(filePath),
      };

    case ACTIONS.ASK_USER_DELETED:
      return {
        path: filePath,
        outcome: OUTCOMES.RESTORE,
        content: await theirs.read(filePath),
      };

    case ACTIONS.ASK_COLLISION:
      return {
        path: filePath,
        outcome: OUTCOMES.COLLISION,
        content: await theirs.read(filePath),
      };

    case ACTIONS.MERGE: {
      const wanted = await theirs.read(filePath);
      const merge = mergeThreeWay({
        base: await base.read(filePath),
        ours: await fs.readFile(target, "utf8"),
        theirs: wanted,
        labels,
      });
      return {
        path: filePath,
        outcome: merge.clean ? OUTCOMES.MERGED : OUTCOMES.CONFLICT,
        content: merge.merged,
        theirs: wanted,
        conflicts: merge.conflicts,
      };
    }

    default:
      return null;
  }
}

async function buildUpgradePlan({ projectPath, manifest, onDownload }) {
  const config = manifest.config;
  const theirs = await buildSnapshot(config, { label: "upgrade-new" });
  let base = null;

  const buildBase = async () => {
    const generate = await loadCreateApp(manifest.cliVersion, { onDownload });
    return buildSnapshot(config, { label: "upgrade-old", generate });
  };

  try {
    const current = await hashProjectFiles(projectPath);

    // An adopted project has no recorded baseline, so the old snapshot has to
    // be built up front: it is the only thing that can say which files came
    // from the template at all. Without it every changed file would land in
    // the caller's lap as an unanswerable question.
    const adopted = Object.keys(manifest.files || {}).length === 0;
    if (adopted) {
      base = await buildBase();
    }

    const baseline = adopted ? base.files : manifest.files;
    const classified = classifyAll({ baseline, current, theirs: theirs.files });
    const work = actionable(classified);

    // Otherwise the old snapshot is the expensive half - a download and an
    // install - and it is only ever needed as the common ancestor of a
    // three-way merge. A project nobody has edited never needs it at all.
    if (!base && work.some(([, result]) => NEEDS_BASE.has(result.action))) {
      base = await buildBase();
    }

    const labels = {
      ours: "your version",
      base: `create-rn-app ${manifest.cliVersion}`,
      theirs: "create-rn-app update",
    };

    const files = [];
    for (const [filePath, result] of work) {
      const item = await planFile(filePath, result, {
        projectPath,
        base,
        theirs,
        labels,
      });
      if (item) {
        files.push(item);
      }
    }

    // Dependencies come from whatever the two templates shipped, so the old
    // package.json is only available when the base snapshot was built. Without
    // it the project's own file stands in, which is exactly right when nobody
    // has edited it.
    const before = base
      ? await base.readJson(PACKAGE_JSON)
      : await fs.readJson(path.join(projectPath, PACKAGE_JSON));
    const dependencies = planDependencyChanges(
      await fs.readJson(path.join(projectPath, PACKAGE_JSON)),
      diffDependencies(before, await theirs.readJson(PACKAGE_JSON))
    );

    const xcode = [
      ...new Set([
        ...Object.keys(theirs.xcode),
        ...(base ? Object.keys(base.xcode) : []),
      ]),
    ]
      .filter(filePath => !base || base.xcode[filePath] !== theirs.xcode[filePath])
      .sort();

    return {
      files,
      dependencies,
      xcode,
      usedBaseSnapshot: Boolean(base),
      baselineUpdates: { ...theirs.files },
      reactNative: (await theirs.readJson(PACKAGE_JSON)).dependencies?.[
        "react-native"
      ],
    };
  } finally {
    await theirs.dispose();
    if (base) {
      await base.dispose();
    }
  }
}

module.exports = { buildUpgradePlan, OUTCOMES, PACKAGE_JSON };
