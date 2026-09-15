const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { compareHashes, compareWithManifest } = require("../../src/manifest/compare");

describe("manifest/compare - compareHashes", () => {
  const recorded = {
    "App.tsx": "aaa",
    "index.js": "bbb",
    "ios/Podfile": "ccc",
    "removed.ts": "ddd",
  };
  const current = {
    "App.tsx": "aaa",
    "index.js": "CHANGED",
    "ios/Podfile": "ccc",
    "src/mine.ts": "eee",
  };

  it("splits files into unchanged, changed, deleted and added", () => {
    const result = compareHashes(recorded, current);

    assert.deepEqual(result.unchanged, ["App.tsx", "ios/Podfile"]);
    assert.deepEqual(result.changed, ["index.js"]);
    assert.deepEqual(result.deleted, ["removed.ts"]);
    assert.deepEqual(result.added, ["src/mine.ts"]);
    assert.equal(result.tracked, 4);
  });

  it("sorts every bucket", () => {
    const result = compareHashes(
      { b: "1", a: "1", c: "1" },
      { b: "2", a: "2", c: "2", z: "3", y: "3" }
    );
    assert.deepEqual(result.changed, ["a", "b", "c"]);
    assert.deepEqual(result.added, ["y", "z"]);
  });

  it("reports a pristine project as entirely unchanged", () => {
    const result = compareHashes(recorded, { ...recorded });
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.deleted, []);
    assert.deepEqual(result.added, []);
    assert.equal(result.unchanged.length, 4);
  });

  it("treats a project with no recorded files as all-user-owned", () => {
    const result = compareHashes({}, { "App.tsx": "aaa" });
    assert.deepEqual(result.added, ["App.tsx"]);
    assert.equal(result.tracked, 0);
  });
});

describe("manifest/compare - compareWithManifest", () => {
  it("compares the manifest against what is on disk", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-compare-"));
    try {
      fs.writeFileSync(path.join(root, "App.tsx"), "original");
      fs.writeFileSync(path.join(root, "index.js"), "stable");

      const { hashProjectFiles } = require("../../src/manifest/hash");
      const manifest = { files: await hashProjectFiles(root) };

      fs.writeFileSync(path.join(root, "App.tsx"), "edited");
      fs.writeFileSync(path.join(root, "extra.ts"), "mine");

      const result = await compareWithManifest(root, manifest);
      assert.deepEqual(result.changed, ["App.tsx"]);
      assert.deepEqual(result.unchanged, ["index.js"]);
      assert.deepEqual(result.added, ["extra.ts"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats a manifest without files as having nothing tracked", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-compare-"));
    try {
      fs.writeFileSync(path.join(root, "App.tsx"), "x");
      const result = await compareWithManifest(root, {});
      assert.equal(result.tracked, 0);
      assert.deepEqual(result.added, ["App.tsx"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
