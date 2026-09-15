const { hashProjectFiles } = require("./hash");

// Compares what is on disk now against what the manifest recorded at generation
// time. `added` is the user's own work: files the template never produced.
// Upgrades build on this - untouched files can be replaced outright, changed
// ones need a merge, and added ones are never touched at all.
function compareHashes(recorded, current) {
  const changed = [];
  const unchanged = [];
  const deleted = [];
  const added = [];

  for (const [file, hash] of Object.entries(recorded)) {
    if (!(file in current)) {
      deleted.push(file);
    } else if (current[file] === hash) {
      unchanged.push(file);
    } else {
      changed.push(file);
    }
  }

  for (const file of Object.keys(current)) {
    if (!(file in recorded)) {
      added.push(file);
    }
  }

  return {
    unchanged: unchanged.sort(),
    changed: changed.sort(),
    deleted: deleted.sort(),
    added: added.sort(),
    tracked: Object.keys(recorded).length,
  };
}

async function compareWithManifest(projectPath, manifest) {
  const current = await hashProjectFiles(projectPath);
  return compareHashes(manifest?.files || {}, current);
}

module.exports = { compareHashes, compareWithManifest };
