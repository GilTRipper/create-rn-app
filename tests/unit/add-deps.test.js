const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  diffDependencies,
  planDependencyChanges,
  applyDependencyChanges,
} = require("../../src/add/deps");

function pkg(dependencies = {}, devDependencies = {}) {
  return { dependencies, devDependencies };
}

describe("add/deps - diffing two snapshots", () => {
  it("sees what the feature introduced, changed and dropped", () => {
    const diff = diffDependencies(
      pkg({ react: "19.2.3", axios: "^1.0.0" }),
      pkg({ react: "19.2.3", axios: "^1.1.0", zustand: "^5.0.8" })
    );

    assert.deepEqual(diff.dependencies.added, { zustand: "^5.0.8" });
    assert.deepEqual(diff.dependencies.changed, { axios: "^1.1.0" });
    assert.deepEqual(diff.dependencies.previous, { axios: "^1.0.0" });
    assert.deepEqual(diff.dependencies.removed, []);
  });

  it("covers devDependencies too", () => {
    const diff = diffDependencies(pkg({}, {}), pkg({}, { jest: "^29.0.0" }));
    assert.deepEqual(diff.devDependencies.added, { jest: "^29.0.0" });
  });
});

describe("add/deps - planning against a real project", () => {
  it("adds what is missing", () => {
    const plan = planDependencyChanges(
      pkg({ react: "19.2.3" }),
      diffDependencies(pkg({ react: "19.2.3" }), pkg({ react: "19.2.3", zustand: "^5.0.8" }))
    );

    assert.deepEqual(plan.apply.dependencies, { zustand: "^5.0.8" });
    assert.deepEqual(plan.conflicts, []);
  });

  // The team pinning a different version is a decision, not a mistake to
  // correct behind their back.
  it("keeps a version the project already pinned differently", () => {
    const plan = planDependencyChanges(
      pkg({ zustand: "^4.0.0" }),
      diffDependencies(pkg({}), pkg({ zustand: "^5.0.8" }))
    );

    assert.equal(plan.apply.dependencies, undefined);
    assert.deepEqual(plan.conflicts, [
      { section: "dependencies", name: "zustand", project: "^4.0.0", wanted: "^5.0.8" },
    ]);
  });

  it("moves a version the team never touched along with the template", () => {
    const plan = planDependencyChanges(
      pkg({ axios: "^1.0.0" }),
      diffDependencies(pkg({ axios: "^1.0.0" }), pkg({ axios: "^1.1.0" }))
    );

    assert.deepEqual(plan.apply.dependencies, { axios: "^1.1.0" });
    assert.deepEqual(plan.conflicts, []);
  });

  // The upgrade path: the template bumped a library the team had already
  // pinned to something else. Their pin wins.
  it("keeps a team pin when the template bumps the same library", () => {
    const plan = planDependencyChanges(
      pkg({ axios: "1.0.5" }),
      diffDependencies(pkg({ axios: "^1.0.0" }), pkg({ axios: "^1.1.0" }))
    );

    assert.equal(plan.apply.dependencies, undefined);
    assert.deepEqual(plan.conflicts, [
      { section: "dependencies", name: "axios", project: "1.0.5", wanted: "^1.1.0" },
    ]);
  });

  it("does not bring back a library the team removed", () => {
    const plan = planDependencyChanges(
      pkg({}),
      diffDependencies(pkg({ axios: "^1.0.0" }), pkg({ axios: "^1.1.0" }))
    );

    assert.equal(plan.apply.dependencies, undefined);
    assert.deepEqual(plan.conflicts, []);
  });

  it("says nothing when the project already has the exact version", () => {
    const plan = planDependencyChanges(
      pkg({ zustand: "^5.0.8" }),
      diffDependencies(pkg({}), pkg({ zustand: "^5.0.8" }))
    );
    assert.deepEqual(plan.apply, {});
    assert.deepEqual(plan.conflicts, []);
  });

  // A dependency the template stopped shipping may well be in use by now.
  it("never removes a dependency, only reports it", () => {
    const plan = planDependencyChanges(
      pkg({ lodash: "^4.17.21" }),
      diffDependencies(pkg({ lodash: "^4.17.21" }), pkg({}))
    );

    assert.deepEqual(plan.removals, [{ section: "dependencies", name: "lodash" }]);
    assert.deepEqual(plan.apply, {});
  });
});

describe("add/deps - applying", () => {
  it("merges entries in and keeps the section sorted", () => {
    const updated = applyDependencyChanges(
      pkg({ zebra: "^1.0.0", alpha: "^1.0.0" }),
      { dependencies: { mango: "^2.0.0" } }
    );

    assert.deepEqual(Object.keys(updated.dependencies), ["alpha", "mango", "zebra"]);
    assert.equal(updated.dependencies.mango, "^2.0.0");
  });

  it("leaves untouched sections exactly as they were", () => {
    const original = { name: "app", scripts: { ios: "x" }, dependencies: {} };
    const updated = applyDependencyChanges(original, {
      dependencies: { zustand: "^5.0.8" },
    });

    assert.deepEqual(updated.scripts, original.scripts);
    assert.equal(updated.name, "app");
  });
});
