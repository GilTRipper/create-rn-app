const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { prompt } = require("../../src/features/firebase/prompt");
const { mockInquirerQueue, promptedNames } = require("../helpers/inquirer");
const { writeDummyFirebaseFiles, uniqueName, cleanup } = require("../helpers/generate");

function makeCtx(extra = {}) {
  return {
    options: extra.options || {},
    config: {
      envSetupSelectedEnvs: extra.envSetupSelectedEnvs || [],
    },
  };
}

describe("firebase prompt", () => {
  it("stays disabled on --yes", async () => {
    const ctx = makeCtx({ options: { yes: true } });
    await prompt(ctx);
    assert.equal(ctx.config.firebase.enabled, false);
    assert.deepEqual(ctx.config.firebase.modules, []);
    assert.deepEqual(ctx.config.firebase.googleFiles.filesByEnv, {});
  });

  it("asks for multi-env Google files when no project envs are selected", async () => {
    const configDir = path.join(os.tmpdir(), uniqueName("fb-prompt-single"));
    writeDummyFirebaseFiles(configDir);
    const mock = mockInquirerQueue([
      { enableFirebase: true },
      { firebaseModules: ["analytics"] },
      { hasMultiFirebaseEnvs: false },
      { firebaseSingleDir: configDir },
    ]);

    try {
      const ctx = makeCtx();
      await prompt(ctx);
      assert.equal(ctx.config.firebase.enabled, true);
      assert.deepEqual(ctx.config.firebase.modules, ["analytics"]);
      assert.ok(ctx.config.firebase.googleFiles.filesByEnv.production);
      assert.ok(
        ctx.config.firebase.googleFiles.filesByEnv.production.iosPlist.endsWith(
          "GoogleService-Info.plist"
        )
      );
      assert.deepEqual(promptedNames(mock.seen), [
        "enableFirebase",
        "firebaseModules",
        "hasMultiFirebaseEnvs",
        "firebaseSingleDir",
      ]);
    } finally {
      mock.restore();
      cleanup(configDir);
    }
  });

  it("uses a per-env folder layout when multi-env is confirmed without project envs", async () => {
    const baseDir = path.join(os.tmpdir(), uniqueName("fb-prompt-multi-prod"));
    writeDummyFirebaseFiles(path.join(baseDir, "production"));
    const mock = mockInquirerQueue([
      { enableFirebase: true },
      { firebaseModules: ["analytics"] },
      { hasMultiFirebaseEnvs: true },
      { firebaseMultiBaseDir: baseDir },
    ]);

    try {
      const ctx = makeCtx();
      await prompt(ctx);
      const files = ctx.config.firebase.googleFiles.filesByEnv;
      assert.ok(files.production.androidJson.includes(`${path.sep}production${path.sep}`));
      assert.deepEqual(Object.keys(files), ["production"]);
    } finally {
      mock.restore();
      cleanup(baseDir);
    }
  });

  it("adds production when a single project env opts into multi-env Firebase", async () => {
    const baseDir = path.join(os.tmpdir(), uniqueName("fb-prompt-staging"));
    writeDummyFirebaseFiles(path.join(baseDir, "production"));
    writeDummyFirebaseFiles(path.join(baseDir, "staging"));
    const mock = mockInquirerQueue([
      { enableFirebase: true },
      { firebaseModules: ["analytics", "remote-config"] },
      { hasMultiFirebaseEnvs: true },
      { firebaseMultiBaseDir: baseDir },
    ]);

    try {
      const ctx = makeCtx({ envSetupSelectedEnvs: ["staging"] });
      await prompt(ctx);
      const files = ctx.config.firebase.googleFiles.filesByEnv;
      assert.deepEqual(Object.keys(files).sort(), ["production", "staging"]);
      assert.ok(files.staging.iosPlist.includes(`${path.sep}staging${path.sep}`));
    } finally {
      mock.restore();
      cleanup(baseDir);
    }
  });

  it("does not ask the multi-env question when several project envs are already selected", async () => {
    const baseDir = path.join(os.tmpdir(), uniqueName("fb-prompt-three"));
    for (const env of ["local", "development", "staging"]) {
      writeDummyFirebaseFiles(path.join(baseDir, env));
    }
    const mock = mockInquirerQueue([
      { enableFirebase: true },
      { firebaseModules: ["messaging"] },
      { firebaseMultiBaseDir: baseDir },
    ]);

    try {
      const ctx = makeCtx({
        envSetupSelectedEnvs: ["local", "development", "staging"],
      });
      await prompt(ctx);
      assert.ok(!promptedNames(mock.seen).includes("hasMultiFirebaseEnvs"));
      assert.deepEqual(
        Object.keys(ctx.config.firebase.googleFiles.filesByEnv).sort(),
        ["development", "local", "staging"]
      );
    } finally {
      mock.restore();
      cleanup(baseDir);
    }
  });
});
