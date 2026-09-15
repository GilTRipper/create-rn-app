const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  FEATURES,
  listFeatures,
  getFeature,
  describeFeatures,
  groupFeatures,
} = require("../../src/features/registry");

const FEATURES_DIR = path.join(__dirname, "../../src/features");

function featureDirectories() {
  return fs
    .readdirSync(FEATURES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

describe("features/registry - catalog integrity", () => {
  // The whole point of the registry is that `features`, `healthcheck`, `add`
  // and --help read one list. A feature added without registering here would
  // silently go missing from all four.
  it("registers every feature directory", () => {
    const registered = FEATURES.map(feature => feature.meta.id).sort();
    assert.deepEqual(registered, featureDirectories());
  });

  it("gives every feature usable metadata", () => {
    for (const feature of FEATURES) {
      const { meta } = feature;
      assert.ok(meta, "missing meta");
      assert.equal(typeof meta.id, "string");
      assert.ok(meta.id.length > 0, `${meta.id}: empty id`);
      assert.ok(meta.title?.length > 0, `${meta.id}: empty title`);
      assert.ok(meta.description?.length > 0, `${meta.id}: empty description`);
      assert.equal(typeof meta.addable, "boolean", `${meta.id}: addable`);
      assert.equal(typeof feature.isInstalled, "function", `${meta.id}`);
    }
  });

  // A locked feature the listing cannot explain is worse than no listing.
  it("explains why a feature cannot be added", () => {
    for (const feature of FEATURES) {
      const { meta } = feature;
      if (meta.addable) {
        assert.equal(meta.unavailableReason, undefined, `${meta.id}`);
      } else {
        assert.ok(meta.unavailableReason?.length > 0, `${meta.id}: no reason`);
      }
    }
  });

  it("keeps ids unique and sorted", () => {
    const ids = FEATURES.map(feature => feature.meta.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids");
    assert.deepEqual(ids, [...ids].sort());
  });

  // CLAUDE.md non-negotiable: apply order is fragile and stays spelled out by
  // hand. The registry is a catalog, and this guards it from becoming the
  // source of a forEach over apply().
  it("is not wired into the generation orchestrator", () => {
    const createApp = fs.readFileSync(
      path.join(__dirname, "../../src/core/create-app.js"),
      "utf8"
    );
    assert.ok(!createApp.includes("registry"), "create-app.js imports registry");
  });
});

describe("features/registry - lookup", () => {
  it("hides apply-only features unless asked", () => {
    const visible = listFeatures().map(feature => feature.meta.id);
    assert.ok(!visible.includes("auth"), "auth should be hidden");

    const all = listFeatures({ includeHidden: true }).map(f => f.meta.id);
    assert.ok(all.includes("auth"));
  });

  it("finds a feature by id and returns null otherwise", () => {
    assert.equal(getFeature("firebase").meta.title, "Firebase");
    assert.equal(getFeature("nope"), null);
  });
});

describe("features/registry - status", () => {
  const config = {
    navigationMode: "with-auth",
    zustandStorage: true,
    theme: true,
    maps: { enabled: true, provider: "react-native-maps" },
    uiKit: { enabled: true, components: ["turbo-image"] },
    firebase: { enabled: false, modules: [] },
    localization: { enabled: false },
    envSetupSelectedEnvs: [],
    assets: { fonts: false, splashScreen: false, appIcon: false },
  };

  it("reports installed as null when there is no manifest to read", () => {
    for (const feature of describeFeatures(null)) {
      assert.equal(feature.installed, null, feature.id);
    }
  });

  it("splits the catalog into installed, addable and unavailable", () => {
    const grouped = groupFeatures(config);

    assert.deepEqual(
      grouped.installed.map(feature => feature.id),
      ["maps", "navigation", "storage", "theme", "ui-kit"]
    );
    assert.deepEqual(
      grouped.addable.map(feature => feature.id),
      ["assets", "firebase", "localization"]
    );
    assert.deepEqual(
      grouped.unavailable.map(feature => feature.id),
      ["environments"]
    );
  });

  it("puts an installed feature in one bucket only", () => {
    const grouped = groupFeatures(config);
    const seen = [
      ...grouped.installed,
      ...grouped.addable,
      ...grouped.unavailable,
    ].map(feature => feature.id);
    assert.equal(new Set(seen).size, seen.length);
    assert.equal(seen.length, listFeatures().length);
  });

  it("counts storage as installed when auth navigation pulled it in", () => {
    const authOnly = { navigationMode: "with-auth", zustandStorage: false };
    assert.equal(getFeature("storage").isInstalled(authOnly), true);
    assert.equal(
      getFeature("storage").isInstalled({ navigationMode: "none" }),
      false
    );
  });

  it("counts environments as installed once any env was selected", () => {
    const environments = getFeature("environments");
    assert.equal(environments.isInstalled({ envSetupSelectedEnvs: [] }), false);
    assert.equal(
      environments.isInstalled({ envSetupSelectedEnvs: ["dev", "prod"] }),
      true
    );
  });
});
