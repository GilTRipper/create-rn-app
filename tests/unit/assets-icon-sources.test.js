const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveIconSources } = require("../../src/features/assets/icon-sources");

function makeIconSet(dir, { android = true, ios = true } = {}) {
  if (android) {
    fs.mkdirSync(path.join(dir, "android", "mipmap-hdpi"), { recursive: true });
    fs.writeFileSync(path.join(dir, "android", "mipmap-hdpi", "ic_launcher.png"), "x");
  }
  if (ios) {
    const iosDir = path.join(dir, "Assets.xcassets", "AppIcon.appiconset");
    fs.mkdirSync(iosDir, { recursive: true });
    fs.writeFileSync(path.join(iosDir, "1024.png"), "x");
  }
}

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crna-icons-"));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("assets/icon-sources", () => {
  // The layout that already shipped: one set, no environments anywhere.
  it("treats a bare directory as the shared set", async () => {
    await withTempDir(async dir => {
      makeIconSet(dir);
      const sources = await resolveIconSources(dir, ["development"]);

      assert.equal(sources.shared, dir);
      assert.deepEqual(sources.byEnv, {});
      assert.deepEqual(sources.unmatched, []);
    });
  });

  it("picks up per-environment subfolders alongside the shared set", async () => {
    await withTempDir(async dir => {
      makeIconSet(dir);
      makeIconSet(path.join(dir, "development"));
      makeIconSet(path.join(dir, "staging"));

      const sources = await resolveIconSources(dir, ["development", "staging"]);

      assert.equal(sources.shared, dir);
      assert.deepEqual(Object.keys(sources.byEnv).sort(), ["development", "staging"]);
    });
  });

  it("works with environment folders and no shared set", async () => {
    await withTempDir(async dir => {
      makeIconSet(path.join(dir, "development"));
      const sources = await resolveIconSources(dir, ["development"]);

      assert.equal(sources.shared, null);
      assert.ok(sources.byEnv.development);
    });
  });

  it("matches environment names case-insensitively", async () => {
    await withTempDir(async dir => {
      makeIconSet(path.join(dir, "Development"));
      const sources = await resolveIconSources(dir, ["development"]);
      assert.ok(sources.byEnv.development);
    });
  });

  // production is always an Android flavor, even when it was never picked in
  // the prompt, so a folder for it has somewhere to go.
  it("accepts a production folder that was never selected", async () => {
    await withTempDir(async dir => {
      makeIconSet(path.join(dir, "production"));
      const sources = await resolveIconSources(dir, ["development"]);
      assert.ok(sources.byEnv.production);
    });
  });

  it("reports folders that match no environment instead of silently dropping them", async () => {
    await withTempDir(async dir => {
      makeIconSet(path.join(dir, "qa"));
      const sources = await resolveIconSources(dir, ["development"]);

      assert.deepEqual(sources.unmatched, ["qa"]);
      assert.deepEqual(sources.byEnv, {});
    });
  });

  it("ignores a subfolder that holds no icons", async () => {
    await withTempDir(async dir => {
      makeIconSet(dir);
      fs.mkdirSync(path.join(dir, "development", "notes"), { recursive: true });
      const sources = await resolveIconSources(dir, ["development"]);

      assert.deepEqual(sources.byEnv, {});
      assert.deepEqual(sources.unmatched, []);
    });
  });

  it("accepts a set that only covers one platform", async () => {
    await withTempDir(async dir => {
      makeIconSet(path.join(dir, "development"), { ios: false });
      const sources = await resolveIconSources(dir, ["development"]);
      assert.ok(sources.byEnv.development);
    });
  });

  it("returns nothing for a missing or unset directory", async () => {
    assert.deepEqual(await resolveIconSources(null, ["development"]), {
      shared: null,
      byEnv: {},
      unmatched: [],
    });
    assert.deepEqual(
      await resolveIconSources("/definitely/not/here", ["development"]),
      { shared: null, byEnv: {}, unmatched: [] }
    );
  });
});
