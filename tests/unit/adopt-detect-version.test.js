const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  detectVersion,
  fingerprintDependencies,
} = require("../../src/adopt/detect-version");
const realMap = require("../../src/adopt/version-map.json");

const HASH_LENGTH = 12;

function depsOf(overrides = {}) {
  return { "react-native": "0.83.2", react: "19.2.0", ...overrides };
}

// A small synthetic map keeps the logic tests independent of whatever is
// actually published - the real map changes with every release.
function fakeMap() {
  const oldDeps = depsOf({ "react-native": "0.82.1" });
  const newDeps = depsOf();
  return {
    hashLength: HASH_LENGTH,
    versions: {
      "1.0.0": {
        reactNative: "0.82.1",
        releasedAt: "2025-11-29",
        dependencies: fingerprintDependencies(oldDeps, HASH_LENGTH),
        files: { "tsconfig.json": "aaaaaaaaaaaa", "eslint.config.js": "bbbbbbbbbbbb" },
      },
      "1.1.0": {
        reactNative: "0.82.1",
        releasedAt: "2025-12-19",
        dependencies: fingerprintDependencies(oldDeps, HASH_LENGTH),
        files: { "tsconfig.json": "aaaaaaaaaaaa", "eslint.config.js": "cccccccccccc" },
      },
      "1.1.6": {
        reactNative: "0.83.2",
        releasedAt: "2026-05-29",
        dependencies: fingerprintDependencies(newDeps, HASH_LENGTH),
        files: {
          "tsconfig.json": "dddddddddddd",
          "eslint.config.js": "cccccccccccc",
          "ios/{app}/BootSplash.storyboard": "eeeeeeeeeeee",
        },
      },
    },
  };
}

describe("adopt/detect-version - identification", () => {
  it("picks the version whose files all line up", () => {
    const result = detectVersion(
      {
        dependencies: depsOf(),
        files: {
          "tsconfig.json": "dddddddddddd0000",
          "eslint.config.js": "cccccccccccc0000",
        },
        appDirName: "MyApp",
      },
      fakeMap()
    );

    assert.equal(result.best.version, "1.1.6");
    assert.equal(result.ambiguous, null);
    assert.equal(result.unreliable, false);
  });

  it("substitutes the app directory into mapped paths", () => {
    const result = detectVersion(
      {
        dependencies: depsOf(),
        files: { "ios/MyApp/BootSplash.storyboard": "eeeeeeeeeeee0000" },
        appDirName: "MyApp",
      },
      fakeMap()
    );

    assert.equal(result.best.version, "1.1.6");
    assert.equal(result.best.matched, 1);
  });

  // Two releases can ship an identical template; guessing between them would
  // produce a wrong snapshot, so the caller has to ask.
  it("reports a tie instead of guessing", () => {
    const result = detectVersion(
      {
        dependencies: depsOf({ "react-native": "0.82.1" }),
        files: { "tsconfig.json": "aaaaaaaaaaaa0000" },
        appDirName: "MyApp",
      },
      fakeMap()
    );

    assert.ok(result.ambiguous, "expected a tie");
    assert.deepEqual(
      result.ambiguous.map(entry => entry.version).sort(),
      ["1.0.0", "1.1.0"]
    );
  });

  it("prefers the later release when the evidence is identical", () => {
    const result = detectVersion(
      {
        dependencies: depsOf({ "react-native": "0.82.1" }),
        files: { "tsconfig.json": "aaaaaaaaaaaa0000" },
        appDirName: "MyApp",
      },
      fakeMap()
    );
    assert.equal(result.best.version, "1.1.0");
  });

  it("breaks a file tie with the dependency fingerprint", () => {
    const map = fakeMap();
    const result = detectVersion(
      {
        // Same single file hash as 1.0.0 and 1.1.0, but the dependency set is
        // 1.1.6's.
        dependencies: depsOf(),
        files: { "eslint.config.js": "cccccccccccc0000" },
        appDirName: "MyApp",
      },
      map
    );
    assert.equal(result.best.version, "1.1.6");
    assert.equal(result.best.dependenciesMatch, true);
  });
});

describe("adopt/detect-version - degradation", () => {
  it("still names the right version when some files were edited", () => {
    const result = detectVersion(
      {
        dependencies: depsOf(),
        files: {
          "tsconfig.json": "dddddddddddd0000",
          "eslint.config.js": "ffffffffffff0000", // edited by the team
        },
        appDirName: "MyApp",
      },
      fakeMap()
    );
    assert.equal(result.best.version, "1.1.6");
    assert.equal(result.best.matched, 1);
    assert.equal(result.best.compared, 2);
  });

  it("flags a project it cannot recognise at all", () => {
    const result = detectVersion(
      {
        dependencies: { "react-native": "0.99.0" },
        files: { "tsconfig.json": "999999999999" },
        appDirName: "MyApp",
      },
      fakeMap()
    );
    assert.equal(result.unreliable, true);
  });

  it("flags a project with none of the mapped files", () => {
    const result = detectVersion(
      { dependencies: depsOf(), files: {}, appDirName: "MyApp" },
      fakeMap()
    );
    assert.equal(result.unreliable, true);
  });
});

describe("adopt/version-map.json - integrity", () => {
  it("covers published versions with the fields detection needs", () => {
    const versions = Object.keys(realMap.versions);
    assert.ok(versions.length >= 10, "map looks truncated");
    assert.equal(realMap.hashLength, HASH_LENGTH);

    for (const [version, entry] of Object.entries(realMap.versions)) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      assert.match(entry.reactNative, /^\d+\.\d+\.\d+$/, version);
      assert.match(entry.dependencies, /^[0-9a-f]{12}$/, version);
      assert.match(entry.releasedAt, /^\d{4}-\d{2}-\d{2}$/, version);
      assert.ok(Object.keys(entry.files).length > 0, `${version}: no files`);
    }
  });

  // A path that still carries a literal placeholder would never match anything
  // in a real project.
  it("records paths as they look in a generated project", () => {
    for (const [version, entry] of Object.entries(realMap.versions)) {
      for (const filePath of Object.keys(entry.files)) {
        assert.ok(
          !/HelloWorld|helloworld/.test(filePath),
          `${version}: unsubstituted placeholder in ${filePath}`
        );
        assert.notEqual(filePath, "_gitignore", `${version}: unrenamed gitignore`);
      }
    }
  });

  // Every recorded path has to disagree between at least two versions,
  // otherwise it is dead weight in a file that ships with the package.
  it("keeps only discriminating paths", () => {
    const versions = Object.keys(realMap.versions);
    const paths = new Set(
      versions.flatMap(version => Object.keys(realMap.versions[version].files))
    );

    for (const filePath of paths) {
      const seen = new Set(
        versions.map(version => realMap.versions[version].files[filePath] || null)
      );
      assert.ok(seen.size > 1, `${filePath} is identical everywhere`);
    }
  });
});
