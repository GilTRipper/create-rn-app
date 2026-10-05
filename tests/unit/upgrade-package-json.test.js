const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  planPackageJson,
  applyPackageJsonPlan,
  hasPackageJsonChanges,
  patchedPackageName,
} = require("../../src/upgrade/package-json");

const NETINFO = "@react-native-community/netinfo";
const NETINFO_KEY = `${NETINFO}@11.4.1`;
const NETINFO_FILE = "patches/@react-native-community__netinfo@11.4.1.patch";
const PICKER_KEY = "react-native-date-picker@5.0.13";
const PICKER_FILE = "patches/react-native-date-picker@5.0.13.patch";

// Shaped after the real 1.1.6 -> current template diff.
function oldTemplate() {
  return {
    scripts: { ios: "react-native run-ios", postinstall: "node setup.js" },
    dependencies: {
      [NETINFO]: "11.4.1",
      "react-native-date-picker": "5.0.13",
      "@d11/react-native-fast-image": "^8.12.0",
      eslint: "^9.0.0",
    },
    devDependencies: { "eslint-plugin-tsc": "^2.0.0" },
    engines: { node: ">=20" },
    pnpm: {
      patchedDependencies: { [NETINFO_KEY]: NETINFO_FILE, [PICKER_KEY]: PICKER_FILE },
    },
  };
}

function newTemplate() {
  return {
    scripts: {
      ios: "react-native run-ios",
      postinstall: "node setup.js",
      lint: "eslint .",
    },
    dependencies: { [NETINFO]: "^12.0.1", "react-native-date-picker": "5.0.13" },
    devDependencies: { eslint: "^9.0.0" },
    engines: { node: ">= 22.11.0" },
    pnpm: { patchedDependencies: { [PICKER_KEY]: PICKER_FILE } },
  };
}

// A project straight out of the old template, plus what a team adds.
function project(changes = {}) {
  const base = oldTemplate();
  return {
    name: "myapp",
    ...base,
    ...changes,
    dependencies: { ...base.dependencies, zustand: "^5.0.8", ...changes.dependencies },
  };
}

const PATCHES = { [NETINFO_FILE]: "netinfo patch", [PICKER_FILE]: "picker patch" };

function contents(projectPatches = PATCHES) {
  return {
    base: PATCHES,
    theirs: { [PICKER_FILE]: "picker patch" },
    project: projectPatches,
  };
}

function plan(projectPackageJson = project(), projectPatches) {
  return planPackageJson({
    base: oldTemplate(),
    theirs: newTemplate(),
    project: projectPackageJson,
    contents: contents(projectPatches),
  });
}

describe("upgrade/package-json - patches", () => {
  it("reads the package name out of a patch key, scoped or not", () => {
    assert.equal(patchedPackageName(NETINFO_KEY), NETINFO);
    assert.equal(patchedPackageName(PICKER_KEY), "react-native-date-picker");
  });

  it("leaves a patch the template did not change", () => {
    const result = plan();
    assert.ok(!result.patches.some(item => item.name === "react-native-date-picker"));
  });

  it("replaces an untouched patch together with its package", () => {
    const result = plan();
    const netinfo = result.patches.find(item => item.name === NETINFO);
    assert.equal(netinfo.action, "replace");
    assert.equal(netinfo.to, null);
    assert.deepEqual(result.apply.dependencies, { [NETINFO]: "^12.0.1" });

    const updated = applyPackageJsonPlan(project(), result, { patches: [netinfo] });
    assert.equal(updated.dependencies[NETINFO], "^12.0.1");
    assert.deepEqual(updated.pnpm.patchedDependencies, { [PICKER_KEY]: PICKER_FILE });
  });

  it("asks about a patch the team edited", () => {
    const result = plan(project(), { ...PATCHES, [NETINFO_FILE]: "netinfo patch + our fix" });
    assert.equal(result.patches.find(item => item.name === NETINFO).action, "ask");
  });

  // Declining keeps the version too: a bumped package with its old patch would
  // make the install fail.
  it("keeps the package at its version when the new patch is declined", () => {
    const result = plan(project(), { ...PATCHES, [NETINFO_FILE]: "edited" });
    const updated = applyPackageJsonPlan(project(), result, {
      keepPackages: new Set([NETINFO]),
      patches: [],
    });
    assert.equal(updated.dependencies[NETINFO], "11.4.1");
    assert.equal(updated.pnpm.patchedDependencies[NETINFO_KEY], NETINFO_FILE);
  });

  it("leaves the patch alone when the team pinned the package", () => {
    const pinned = project({ dependencies: { [NETINFO]: "11.4.2" } });
    const result = plan(pinned);
    assert.equal(result.patches.find(item => item.name === NETINFO).action, "pinned");
    assert.equal(result.apply.dependencies, undefined);
  });

  it("never touches a patch the template never shipped", () => {
    const own = project({
      pnpm: {
        patchedDependencies: {
          ...oldTemplate().pnpm.patchedDependencies,
          "zustand@5.0.8": "patches/zustand@5.0.8.patch",
        },
      },
    });
    const result = plan(own);
    assert.ok(!result.patches.some(item => item.name === "zustand"));
  });

  it("does not bring back a patch the team removed", () => {
    const pnpm = { patchedDependencies: { [PICKER_KEY]: PICKER_FILE } };
    const result = plan(project({ pnpm }), { [PICKER_FILE]: "picker patch" });
    assert.ok(!result.patches.some(item => item.name === NETINFO));
  });
});

describe("upgrade/package-json - dependencies", () => {
  it("moves a package between sections when the team left it where it was", () => {
    const result = plan();
    assert.deepEqual(result.moves.apply, [
      { name: "eslint", from: "dependencies", to: "devDependencies", version: "^9.0.0" },
    ]);
    const updated = applyPackageJsonPlan(project(), result, { patches: [] });
    assert.equal(updated.dependencies.eslint, undefined);
    assert.equal(updated.devDependencies.eslint, "^9.0.0");
  });

  it("leaves a moved package where it is when the team changed its version", () => {
    const result = plan(project({ dependencies: { eslint: "^9.9.0" } }));
    assert.deepEqual(result.moves.apply, []);
    assert.equal(result.moves.conflicts[0].project, "^9.9.0");
  });

  it("offers to remove dropped packages but never the team's own", () => {
    const result = plan();
    assert.deepEqual(
      result.removals.map(removal => removal.name).sort(),
      ["@d11/react-native-fast-image", "eslint-plugin-tsc"]
    );
  });

  it("removes only what was agreed to", () => {
    const result = plan();
    const fastImage = result.removals.find(
      removal => removal.name === "@d11/react-native-fast-image"
    );
    const updated = applyPackageJsonPlan(project(), result, {
      removePackages: [fastImage],
      patches: [],
    });
    assert.equal(updated.dependencies["@d11/react-native-fast-image"], undefined);
    assert.equal(updated.devDependencies["eslint-plugin-tsc"], "^2.0.0");
    assert.equal(updated.dependencies.zustand, "^5.0.8");
  });
});

describe("upgrade/package-json - scripts and engines", () => {
  it("adds new scripts and follows the template where the team did not edit", () => {
    const result = plan();
    assert.deepEqual(result.fields.scripts.set, { lint: "eslint ." });
    assert.deepEqual(result.fields.engines.set, { node: ">= 22.11.0" });
  });

  it("keeps a value the team changed and reports it", () => {
    const result = plan(project({ engines: { node: ">=22" } }));
    assert.deepEqual(result.fields.engines.set, {});
    assert.deepEqual(result.fields.engines.conflicts, [
      { field: "engines", key: "node", project: ">=22", wanted: ">= 22.11.0" },
    ]);
  });

  it("removes a script the template dropped only if the team never edited it", () => {
    const base = oldTemplate();
    const theirs = newTemplate();
    delete theirs.scripts.postinstall;

    const untouched = planPackageJson({
      base,
      theirs,
      project: project(),
      contents: contents(),
    });
    assert.deepEqual(untouched.fields.scripts.remove, ["postinstall"]);

    const edited = planPackageJson({
      base,
      theirs,
      project: project({ scripts: { ...base.scripts, postinstall: "node ours.js" } }),
      contents: contents(),
    });
    assert.deepEqual(edited.fields.scripts.remove, []);
    assert.equal(edited.fields.scripts.conflicts[0].wanted, null);
  });

  it("keeps the order of existing scripts and appends new ones", () => {
    const result = plan();
    const updated = applyPackageJsonPlan(project(), result, { patches: [] });
    assert.deepEqual(Object.keys(updated.scripts), ["ios", "postinstall", "lint"]);
  });

  it("reports nothing to do when both templates agree", () => {
    const same = planPackageJson({
      base: newTemplate(),
      theirs: newTemplate(),
      project: { ...newTemplate(), dependencies: { ...newTemplate().dependencies, x: "1" } },
      contents: { base: {}, theirs: {}, project: {} },
    });
    assert.equal(hasPackageJsonChanges(same), false);
    assert.deepEqual(same.removals, []);
  });
});
