const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getPrompts } = require("../../src/get-prompts");
const { mockInquirerQueue } = require("../helpers/inquirer");

describe("getPrompts --yes", () => {
  it("fills CLI fields and leaves every optional feature off without asking", async () => {
    const mock = mockInquirerQueue([{}]);
    try {
      const config = await getPrompts(`YesApp${process.pid}`, {
        yes: true,
        bundleId: "com.yes.app",
        displayName: "Yes App",
        packageManager: "npm",
        skipInstall: true,
        skipGit: true,
        skipPods: true,
      });

      assert.equal(config.projectName, `YesApp${process.pid}`);
      assert.equal(config.bundleIdentifier, "com.yes.app");
      assert.equal(config.displayName, "Yes App");
      assert.equal(config.packageManager, "npm");
      assert.equal(config.skipInstall, true);
      assert.equal(config.skipGit, true);
      assert.equal(config.skipPods, true);
      assert.equal(config.autoYes, true);
      assert.equal(config.splashScreenDir, null);
      assert.equal(config.appIconDir, null);
      assert.equal(config.fontsDir, null);
      assert.deepEqual(config.envSetupSelectedEnvs, []);
      assert.equal(config.firebase.enabled, false);
      assert.deepEqual(config.firebase.modules, []);
      assert.equal(config.maps.enabled, false);
      assert.equal(config.zustandStorage, false);
      assert.equal(config.navigationMode, "none");
      assert.equal(config.localization.enabled, false);
      assert.equal(config.theme, false);
      assert.equal(config.uiKit.enabled, false);
      assert.equal(mock.seen.length, 1);
      assert.deepEqual(mock.seen[0], []);
    } finally {
      mock.restore();
    }
  });
});
