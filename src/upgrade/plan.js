const fs = require("fs-extra");
const path = require("path");
const { buildSnapshot } = require("../snapshot");
const { hashProjectFiles } = require("../manifest/hash");
const { classifyAll, ACTIONS } = require("../merge/classify");
const { mergeThreeWay } = require("../merge/three-way");
const {
  planPackageJson,
  emptyPackageJsonPlan,
  patchFiles,
} = require("./package-json");
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

// Patch files travel with the package they patch, so they are decided in the
// package.json lane together with the version, never on their own.
function actionable(classified, packageLaneFiles) {
  return Object.entries(classified).filter(
    ([filePath, result]) =>
      filePath !== PACKAGE_JSON &&
      !packageLaneFiles.has(filePath) &&
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

async function readOrNull(read, filePath) {
  try {
    return await read(filePath);
  } catch {
    return null;
  }
}

async function readPatchContents(packageJson, read) {
  const contents = {};
  for (const file of patchFiles(packageJson)) {
    contents[file] = await readOrNull(read, file);
  }
  return contents;
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

    // package.json is always edited by the team, so the only question worth
    // asking is whether the template changed its own output - the recorded
    // hash answers that. Patches are content outside package.json, so a patch
    // rewritten under the same name counts too.
    const theirsPackageJson = await theirs.readJson(PACKAGE_JSON);
    const packageLaneNeeded =
      adopted ||
      [PACKAGE_JSON, ...patchFiles(theirsPackageJson)].some(
        filePath => baseline[filePath] !== theirs.files[filePath]
      );

    // Otherwise the old snapshot is the expensive half - a download and an
    // install - and it is only ever needed as the common ancestor: of a
    // three-way merge, or of package.json. A project nobody has edited, on a
    // template that left package.json alone, never needs it at all.
    const needsBaseForFiles = actionable(classified, new Set()).some(([, result]) =>
      NEEDS_BASE.has(result.action)
    );
    if (!base && (packageLaneNeeded || needsBaseForFiles)) {
      base = await buildBase();
    }

    const basePackageJson = base ? await base.readJson(PACKAGE_JSON) : null;
    const packageLaneFiles = new Set([
      ...patchFiles(theirsPackageJson),
      ...patchFiles(basePackageJson),
    ]);
    const work = actionable(classified, packageLaneFiles);

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

    // Never the project's own package.json standing in for the old template:
    // every dependency the team added would then read as "the template
    // dropped it".
    let dependencies = emptyPackageJsonPlan();
    if (packageLaneNeeded) {
      const projectPackageJson = await fs.readJson(path.join(projectPath, PACKAGE_JSON));
      const theirsPatches = await readPatchContents(theirsPackageJson, theirs.read);
      dependencies = planPackageJson({
        base: basePackageJson,
        theirs: theirsPackageJson,
        project: projectPackageJson,
        contents: {
          base: await readPatchContents(basePackageJson, base.read),
          theirs: theirsPatches,
          project: await readPatchContents(projectPackageJson, filePath =>
            fs.readFile(path.join(projectPath, filePath), "utf8")
          ),
        },
      });
      // Written into the project when a patch is accepted.
      dependencies.patchContents = theirsPatches;
    }

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
      reactNative: theirsPackageJson.dependencies?.[
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
