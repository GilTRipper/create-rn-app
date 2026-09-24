const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { hashProjectFiles } = require("./manifest/hash");

// What a clean generation with a given config produces, built in a temp
// directory. This is the only honest answer to "what should this file look
// like", and both `add` and `upgrade` are built on it: `add` compares a
// snapshot of the old config against one of the new, `upgrade` compares
// versions. Nothing here touches the user's project.
// src/shared/xcode.js mints object ids with Math.random(), so every generation
// produces a different project.pbxproj and different .xcscheme files. They can
// never be written into a real project from a snapshot - the ids would not be
// the project's own - so they stay out of the file lane.
//
// Blanking the ids does make them comparable, though, and that is worth having:
// it answers "did this change the Xcode project at all", which is the
// difference between telling the user to go look and saying nothing.
const XCODE_GENERATED = [/\.pbxproj$/, /\.xcscheme$/];
const XCODE_OBJECT_ID = /\b[0-9A-F]{24}\b/g;

function isComparable(relativePath) {
  return !XCODE_GENERATED.some(pattern => pattern.test(relativePath));
}

function normalizeXcodeIds(content) {
  return content.replace(XCODE_OBJECT_ID, "ID");
}

const SILENCED = ["log", "error", "warn", "info"];

// createApp reports through console.* and draws ora spinners on stderr. A
// snapshot is internal bookkeeping, so none of it should reach the user.
async function withoutOutput(run) {
  const originals = SILENCED.map(method => console[method]);
  const originalWrite = process.stderr.write.bind(process.stderr);

  SILENCED.forEach(method => {
    console[method] = () => {};
  });
  process.stderr.write = () => true;

  try {
    return await run();
  } finally {
    SILENCED.forEach((method, index) => {
      console[method] = originals[index];
    });
    process.stderr.write = originalWrite;
  }
}

// `generate` lets an older published version build the snapshot with its own
// code, which is the only honest way to reproduce how a project looked when it
// was generated.
async function buildSnapshot(config, { label = "snapshot", generate } = {}) {
  // Required lazily: createApp pulls in every feature, and snapshot.js is
  // imported by commands that may never build one.
  const createApp = generate || require("./template").createApp;

  const root = await fs.mkdtemp(path.join(os.tmpdir(), `crna-${label}-`));
  const projectPath = path.join(root, config.projectName);

  const snapshotConfig = {
    ...config,
    projectPath,
    skipInstall: true,
    skipPods: true,
    skipGit: true,
    // Local asset directories belong to the machine that ran the original
    // generation and are excluded from every merge anyway.
    fontsDir: null,
    splashScreenDir: null,
    appIconDir: null,
  };

  await withoutOutput(() => createApp(snapshotConfig));

  const allFiles = await hashProjectFiles(projectPath);
  const files = {};
  const xcode = {};
  for (const [relativePath, hash] of Object.entries(allFiles)) {
    if (isComparable(relativePath)) {
      files[relativePath] = hash;
    } else {
      const content = await fs.readFile(
        path.join(projectPath, relativePath),
        "utf8"
      );
      xcode[relativePath] = crypto
        .createHash("sha1")
        .update(normalizeXcodeIds(content))
        .digest("hex");
    }
  }

  return {
    root,
    projectPath,
    files,
    xcode,
    read: relativePath => fs.readFile(path.join(projectPath, relativePath), "utf8"),
    exists: relativePath => fs.pathExists(path.join(projectPath, relativePath)),
    readJson: relativePath => fs.readJson(path.join(projectPath, relativePath)),
    dispose: () => fs.remove(root),
  };
}

module.exports = { buildSnapshot, isComparable, normalizeXcodeIds };
