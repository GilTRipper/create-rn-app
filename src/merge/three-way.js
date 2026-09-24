const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// git merge-file is the same three-way engine git itself uses on a merge, so
// conflict markers look exactly like the ones people already know how to
// resolve. Writing our own line merger would be a worse version of it.
function isGitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_LABELS = {
  ours: "your version",
  base: "original",
  theirs: "create-rn-app",
};

// Returns the merged text plus how many conflicts git could not settle.
// `clean` means the result can be written without a human looking at it.
function mergeThreeWay({ base, ours, theirs, labels = {} }) {
  if (ours === theirs) {
    return { merged: ours, conflicts: 0, clean: true, unchanged: true };
  }
  if (ours === base) {
    return { merged: theirs, conflicts: 0, clean: true, unchanged: false };
  }
  if (theirs === base) {
    return { merged: ours, conflicts: 0, clean: true, unchanged: true };
  }

  const names = { ...DEFAULT_LABELS, ...labels };
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "crna-merge-"));

  try {
    const oursPath = path.join(workDir, "ours");
    const basePath = path.join(workDir, "base");
    const theirsPath = path.join(workDir, "theirs");
    fs.writeFileSync(oursPath, ours);
    fs.writeFileSync(basePath, base);
    fs.writeFileSync(theirsPath, theirs);

    let merged;
    let conflicts = 0;
    try {
      merged = execFileSync(
        "git",
        [
          "merge-file",
          "-p",
          "--diff3",
          "-L",
          names.ours,
          "-L",
          names.base,
          "-L",
          names.theirs,
          oursPath,
          basePath,
          theirsPath,
        ],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
      );
    } catch (error) {
      // A positive status is the conflict count, not a failure. Anything else
      // (git missing, unreadable input) is a real error.
      if (typeof error.status !== "number" || error.status < 0) {
        throw new Error(`git merge-file failed: ${error.message}`);
      }
      merged = error.stdout;
      conflicts = error.status;
    }

    return { merged, conflicts, clean: conflicts === 0, unchanged: false };
  } finally {
    fs.removeSync(workDir);
  }
}

module.exports = { mergeThreeWay, isGitAvailable };
