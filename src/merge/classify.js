// What to do with one file during `add` or `upgrade`.
//
// Three facts decide it, and only three:
//   baseline - hash of what the CLI generated last time (from the manifest)
//   current  - hash of what is on disk now
//   theirs   - hash of what the CLI would generate now
//
// baseline vs current says whether the *user* touched the file.
// baseline vs theirs says whether the *template* changed it.
// Neither question can answer the other, which is why both are needed.
const ACTIONS = {
  ADD: "add",
  OVERWRITE: "overwrite",
  MERGE: "merge",
  SKIP_UNCHANGED: "skip-unchanged",
  SKIP_USER_OWNED: "skip-user-owned",
  SKIP_GONE: "skip-gone",
  ASK_USER_DELETED: "ask-user-deleted",
  ASK_COLLISION: "ask-collision",
  REPORT_REMOVED: "report-removed",
};

function classifyFile({ baseline, current, theirs }) {
  const hasBaseline = Boolean(baseline);
  const onDisk = Boolean(current);
  const inTemplate = Boolean(theirs);

  if (!hasBaseline) {
    if (!onDisk) {
      // The template grew a file this project never had.
      return { action: ACTIONS.ADD, reason: "new template file" };
    }
    if (!inTemplate) {
      return { action: ACTIONS.SKIP_USER_OWNED, reason: "not from the template" };
    }
    if (current === theirs) {
      return { action: ACTIONS.SKIP_UNCHANGED, reason: "already identical" };
    }
    // An adopted project, or a file the user created at a path the template
    // now also uses. There is no baseline to merge against, so a human decides.
    return { action: ACTIONS.ASK_COLLISION, reason: "no baseline to merge from" };
  }

  if (!inTemplate) {
    return onDisk
      ? { action: ACTIONS.REPORT_REMOVED, reason: "template no longer ships it" }
      : { action: ACTIONS.SKIP_GONE, reason: "gone from both sides" };
  }

  if (!onDisk) {
    return { action: ACTIONS.ASK_USER_DELETED, reason: "deleted from the project" };
  }

  // Checked before the user question on purpose: when the template did not move,
  // nothing needs doing however much the user changed the file.
  if (baseline === theirs) {
    return { action: ACTIONS.SKIP_UNCHANGED, reason: "template did not change it" };
  }

  if (current === baseline) {
    return { action: ACTIONS.OVERWRITE, reason: "untouched since generation" };
  }

  return { action: ACTIONS.MERGE, reason: "changed by both sides" };
}

// paths is the union of every path known to the manifest, the disk and the
// freshly generated snapshot.
function classifyAll({ baseline = {}, current = {}, theirs = {} }) {
  const paths = new Set([
    ...Object.keys(baseline),
    ...Object.keys(current),
    ...Object.keys(theirs),
  ]);

  const classified = {};
  for (const filePath of [...paths].sort()) {
    classified[filePath] = classifyFile({
      baseline: baseline[filePath],
      current: current[filePath],
      theirs: theirs[filePath],
    });
  }
  return classified;
}

function groupByAction(classified) {
  const grouped = {};
  for (const [filePath, result] of Object.entries(classified)) {
    (grouped[result.action] = grouped[result.action] || []).push(filePath);
  }
  return grouped;
}

module.exports = { ACTIONS, classifyFile, classifyAll, groupByAction };
