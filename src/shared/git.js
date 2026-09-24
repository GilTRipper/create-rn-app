const { execFileSync } = require("child_process");

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isGitRepository(projectPath) {
  try {
    return runGit(["rev-parse", "--is-inside-work-tree"], projectPath).trim() === "true";
  } catch {
    return false;
  }
}

// A clean tree is what makes every write reversible with `git checkout`, which
// is a better undo than any backup directory this CLI could invent.
function workingTreeStatus(projectPath) {
  if (!isGitRepository(projectPath)) {
    return { repository: false, clean: false, changes: [] };
  }

  try {
    const output = runGit(["status", "--porcelain"], projectPath);
    const changes = output.split("\n").filter(line => line.trim().length > 0);
    return { repository: true, clean: changes.length === 0, changes };
  } catch {
    return { repository: true, clean: false, changes: [] };
  }
}

module.exports = { isGitRepository, workingTreeStatus };
