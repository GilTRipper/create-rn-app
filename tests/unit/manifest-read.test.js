const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
  validateManifest,
} = require("../../src/manifest/schema");
const { readManifest, hasManifest } = require("../../src/manifest/read");

function tempProject(manifestContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-manifest-"));
  if (manifestContent !== undefined) {
    fs.writeFileSync(manifestPath(root), manifestContent);
  }
  return root;
}

function validManifest(overrides = {}) {
  return {
    manifestVersion: MANIFEST_VERSION,
    cliVersion: "1.1.6",
    reactNative: "0.86.2",
    createdAt: "2026-09-15T10:00:00.000Z",
    config: { projectName: "MyApp" },
    files: { "App.tsx": "a".repeat(40) },
    ...overrides,
  };
}

describe("manifest/schema - validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = validManifest();
    assert.equal(validateManifest(manifest), manifest);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 42, "text", []]) {
      assert.throws(() => validateManifest(value), /malformed/);
    }
  });

  it("rejects a missing or bogus manifestVersion", () => {
    assert.throws(
      () => validateManifest(validManifest({ manifestVersion: undefined })),
      /manifestVersion/
    );
    assert.throws(
      () => validateManifest(validManifest({ manifestVersion: "1" })),
      /manifestVersion/
    );
    assert.throws(
      () => validateManifest(validManifest({ manifestVersion: 0 })),
      /manifestVersion/
    );
  });

  it("tells the user to update when the manifest is from a newer CLI", () => {
    assert.throws(
      () =>
        validateManifest(validManifest({ manifestVersion: MANIFEST_VERSION + 1 })),
      /newer create-rn-app[\s\S]*Update the CLI/
    );
  });

  it("rejects a manifest without config", () => {
    assert.throws(
      () => validateManifest(validManifest({ config: undefined })),
      /missing "config"/
    );
  });
});

describe("manifest/read", () => {
  it("returns null for a project that has no manifest", async () => {
    const root = tempProject();
    try {
      assert.equal(await hasManifest(root), false);
      assert.equal(await readManifest(root), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a valid manifest", async () => {
    const root = tempProject(JSON.stringify(validManifest()));
    try {
      assert.equal(await hasManifest(root), true);
      const manifest = await readManifest(root);
      assert.equal(manifest.cliVersion, "1.1.6");
      assert.equal(manifest.config.projectName, "MyApp");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // A broken manifest must not look like an absent one: callers treat null as
  // "not our project" and would silently do the wrong thing.
  it("throws rather than returning null on invalid JSON", async () => {
    const root = tempProject("{ not json");
    try {
      await assert.rejects(
        () => readManifest(root),
        new RegExp(`${MANIFEST_FILENAME.replace(".", "\\.")} is not valid JSON`)
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws on a structurally invalid manifest", async () => {
    const root = tempProject(JSON.stringify({ hello: "world" }));
    try {
      await assert.rejects(() => readManifest(root), /manifestVersion/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
