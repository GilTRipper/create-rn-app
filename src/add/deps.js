// package.json gets a semantic merge, never a textual one: by the time someone
// runs `add`, the file is full of the team's own dependencies and scripts, and
// a line merge would fight with them for no reason. Only what the feature
// itself introduced is carried over.
const SECTIONS = ["dependencies", "devDependencies"];

function diffSection(before = {}, after = {}) {
  const added = {};
  const changed = {};
  const removed = [];

  for (const [name, version] of Object.entries(after)) {
    if (!(name in before)) {
      added[name] = version;
    } else if (before[name] !== version) {
      changed[name] = version;
    }
  }
  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      removed.push(name);
    }
  }

  return { added, changed, removed };
}

function diffDependencies(basePackageJson, theirsPackageJson) {
  const diff = {};
  for (const section of SECTIONS) {
    diff[section] = diffSection(
      basePackageJson[section],
      theirsPackageJson[section]
    );
  }
  return diff;
}

// `changed` is applied only when the project still carries the version the
// feature was previously pinned to. A team that bumped a library on purpose
// keeps its choice, and the mismatch is reported instead.
function planDependencyChanges(projectPackageJson, diff) {
  const apply = {};
  const conflicts = [];
  const removals = [];

  for (const section of SECTIONS) {
    const sectionDiff = diff[section];
    const current = projectPackageJson[section] || {};
    const sectionApply = {};

    for (const [name, version] of Object.entries(sectionDiff.added)) {
      if (!(name in current)) {
        sectionApply[name] = version;
      } else if (current[name] !== version) {
        conflicts.push({ section, name, project: current[name], wanted: version });
      }
    }

    for (const [name, version] of Object.entries(sectionDiff.changed)) {
      if (current[name] === version) {
        continue;
      }
      sectionApply[name] = version;
    }

    // A dependency the feature stopped needing stays put: the team may well be
    // using it by now.
    for (const name of sectionDiff.removed) {
      if (name in current) {
        removals.push({ section, name });
      }
    }

    if (Object.keys(sectionApply).length > 0) {
      apply[section] = sectionApply;
    }
  }

  return { apply, conflicts, removals };
}

function applyDependencyChanges(projectPackageJson, apply) {
  const updated = { ...projectPackageJson };

  for (const [section, entries] of Object.entries(apply)) {
    const merged = { ...(updated[section] || {}), ...entries };
    updated[section] = Object.fromEntries(
      Object.keys(merged)
        .sort()
        .map(name => [name, merged[name]])
    );
  }

  return updated;
}

module.exports = {
  diffDependencies,
  planDependencyChanges,
  applyDependencyChanges,
};
