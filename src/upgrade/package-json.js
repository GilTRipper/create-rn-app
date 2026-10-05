const { diffDependencies, planDependencyChanges } = require("../add/deps");

// Everything upgrade does to package.json beyond plain version bumps. Each
// decision compares three values - the old template, the new template and the
// project - so a team's own choice is never overwritten in silence.
//
// Nothing here touches the disk: the caller reads the three package.json files
// and the patch contents, and later applies the decisions. That keeps the rules
// testable without generating a single project.
const SECTIONS = ["dependencies", "devDependencies"];
const KEYED_FIELDS = ["scripts", "engines"];

// "react-native-date-picker@5.0.13" -> "react-native-date-picker",
// "@react-native-community/netinfo@11.4.1" -> "@react-native-community/netinfo".
function patchedPackageName(key) {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

function patchesByPackage(packageJson) {
  const patches = {};
  for (const [key, file] of Object.entries(
    packageJson?.pnpm?.patchedDependencies || {}
  )) {
    patches[patchedPackageName(key)] = { key, file };
  }
  return patches;
}

function patchFiles(packageJson) {
  return Object.values(packageJson?.pnpm?.patchedDependencies || {});
}

function sectionOf(packageJson, name) {
  return SECTIONS.find(section => name in (packageJson?.[section] || {})) || null;
}

// A package the template moved between sections shows up in the per-section
// diff as "removed here, added there". Pulled out before planning, or the
// project would end up with it in both.
function extractMoves(diff) {
  const moves = [];
  for (const from of SECTIONS) {
    const to = SECTIONS.find(section => section !== from);
    for (const name of [...diff[from].removed]) {
      if (name in diff[to].added) {
        moves.push({ name, from, to, version: diff[to].added[name] });
        diff[from].removed = diff[from].removed.filter(entry => entry !== name);
        delete diff[to].added[name];
      }
    }
  }
  return moves;
}

function planMoves(moves, base, project) {
  const apply = [];
  const conflicts = [];

  for (const move of moves) {
    const projectSection = sectionOf(project, move.name);
    if (projectSection === move.to || projectSection === null) {
      continue;
    }
    if (project[move.from][move.name] === base[move.from][move.name]) {
      apply.push(move);
    } else {
      conflicts.push({ ...move, project: project[move.from][move.name] });
    }
  }

  return { apply, conflicts };
}

// scripts and engines: key by key, with the same rule as the files. Untouched
// by the team -> follow the template; changed by the team -> keep and report;
// the team's own keys never come up because the template has no opinion.
function planKeyedField(field, base, theirs, project) {
  const before = base?.[field] || {};
  const after = theirs?.[field] || {};
  const current = project?.[field] || {};
  const set = {};
  const remove = [];
  const conflicts = [];

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key];
    const wanted = after[key];
    const mine = current[key];

    if (was === wanted || mine === wanted) {
      continue;
    }

    if (wanted === undefined) {
      if (mine === was) {
        remove.push(key);
      } else if (mine !== undefined) {
        conflicts.push({ field, key, project: mine, wanted: null });
      }
    } else if (was === undefined) {
      if (mine === undefined) {
        set[key] = wanted;
      } else {
        conflicts.push({ field, key, project: mine, wanted });
      }
    } else if (mine === was) {
      set[key] = wanted;
    } else if (mine !== undefined) {
      // Missing means the team removed it on purpose; bringing it back would
      // undo that, so it is not even worth a line.
      conflicts.push({ field, key, project: mine, wanted });
    }
  }

  return { set, remove, conflicts };
}

// A patch is pinned to an exact version, so it travels with its package: the
// two either move together or stay together. See TODO rules 1-5.
function planPatches({ base, theirs, project, contents, pinned }) {
  const before = patchesByPackage(base);
  const after = patchesByPackage(theirs);
  const current = patchesByPackage(project);
  const items = [];

  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[name] || null;
    const wanted = after[name] || null;
    const mine = current[name] || null;

    // 1. The template's patch did not move at all.
    if (
      was &&
      wanted &&
      was.key === wanted.key &&
      contents.base[was.file] === contents.theirs[wanted.file]
    ) {
      continue;
    }

    // 4. The team pinned the package themselves: its patch stays with it.
    if (pinned.has(name)) {
      if (mine) {
        items.push({ name, action: "pinned", from: mine, to: wanted });
      }
      continue;
    }

    if (!mine) {
      // Either the team dropped the patch on purpose, or the template brings a
      // brand new one along with its package.
      if (!was && wanted) {
        items.push({ name, action: "add", from: null, to: wanted });
      }
      continue;
    }

    // 5. A patch the template never shipped belongs to the team.
    if (!was) {
      items.push({ name, action: "own", from: mine, to: wanted });
      continue;
    }

    const edited =
      mine.key !== was.key || contents.project[mine.file] !== contents.base[was.file];
    // 2. Untouched: replace in silence. 3. Edited by the team: ask.
    items.push({ name, action: edited ? "ask" : "replace", from: mine, to: wanted });
  }

  return items;
}

function planPackageJson({ base, theirs, project, contents }) {
  const diff = diffDependencies(base, theirs);
  const moves = planMoves(extractMoves(diff), base, project);
  const dependencies = planDependencyChanges(project, diff);
  const pinned = new Set(dependencies.conflicts.map(conflict => conflict.name));

  // The template dropped the package altogether: the team is asked whether it
  // goes, and its patch - if any - shares that fate.
  const removals = dependencies.removals.map(removal => ({
    ...removal,
    version: project[removal.section][removal.name],
  }));
  const removedNames = new Set(removals.map(removal => removal.name));

  const patches = planPatches({ base, theirs, project, contents, pinned }).map(item =>
    removedNames.has(item.name) && !item.to ? { ...item, followsRemoval: true } : item
  );

  const fields = {};
  for (const field of KEYED_FIELDS) {
    fields[field] = planKeyedField(field, base, theirs, project);
  }

  return {
    apply: dependencies.apply,
    conflicts: dependencies.conflicts,
    removals,
    moves,
    fields,
    patches,
  };
}

// `decisions.keepPackages` - packages whose bump was declined together with
// their patch. `decisions.removePackages` - [{ section, name }] the team agreed
// to drop. `decisions.patches` - the patch items that were accepted.
function applyPackageJsonPlan(packageJson, plan, decisions = {}) {
  const keep = decisions.keepPackages || new Set();
  const updated = { ...packageJson };

  for (const section of SECTIONS) {
    const entries = { ...(updated[section] || {}) };
    let touched = false;

    for (const [name, version] of Object.entries(plan.apply[section] || {})) {
      if (!keep.has(name)) {
        entries[name] = version;
        touched = true;
      }
    }
    for (const move of plan.moves.apply) {
      if (move.from === section) {
        delete entries[move.name];
        touched = true;
      } else if (move.to === section) {
        entries[move.name] = move.version;
        touched = true;
      }
    }
    for (const removal of decisions.removePackages || []) {
      if (removal.section === section) {
        delete entries[removal.name];
        touched = true;
      }
    }

    if (touched) {
      updated[section] = Object.fromEntries(
        Object.keys(entries)
          .sort()
          .map(name => [name, entries[name]])
      );
    }
  }

  // Unlike dependencies, scripts are read by people in the order they were
  // written, so existing keys stay put and new ones go to the end.
  for (const [field, change] of Object.entries(plan.fields)) {
    if (Object.keys(change.set).length === 0 && change.remove.length === 0) {
      continue;
    }
    const entries = { ...(updated[field] || {}), ...change.set };
    change.remove.forEach(key => delete entries[key]);
    updated[field] = entries;
  }

  const accepted = decisions.patches || [];
  if (accepted.length > 0) {
    const patched = { ...(updated.pnpm?.patchedDependencies || {}) };
    for (const item of accepted) {
      if (item.from) {
        delete patched[item.from.key];
      }
      if (item.to) {
        patched[item.to.key] = item.to.file;
      }
    }
    updated.pnpm = { ...(updated.pnpm || {}), patchedDependencies: patched };
    if (Object.keys(patched).length === 0) {
      delete updated.pnpm.patchedDependencies;
    }
    if (Object.keys(updated.pnpm).length === 0) {
      delete updated.pnpm;
    }
  }

  return updated;
}

function hasPackageJsonChanges(plan) {
  return (
    Object.keys(plan.apply).length > 0 ||
    plan.moves.apply.length > 0 ||
    plan.removals.length > 0 ||
    plan.patches.some(item => ["add", "replace", "ask"].includes(item.action)) ||
    Object.values(plan.fields).some(
      change => Object.keys(change.set).length > 0 || change.remove.length > 0
    )
  );
}

function emptyPackageJsonPlan() {
  return {
    apply: {},
    conflicts: [],
    removals: [],
    moves: { apply: [], conflicts: [] },
    fields: Object.fromEntries(
      KEYED_FIELDS.map(field => [field, { set: {}, remove: [], conflicts: [] }])
    ),
    patches: [],
  };
}

module.exports = {
  planPackageJson,
  applyPackageJsonPlan,
  hasPackageJsonChanges,
  emptyPackageJsonPlan,
  patchFiles,
  patchedPackageName,
};
