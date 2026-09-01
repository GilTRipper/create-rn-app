const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { prompt } = require("../../src/features/environments/prompt");
const { mockInquirerQueue, promptedNames } = require("../helpers/inquirer");

describe("environments prompt", () => {
  it("leaves envs empty on --yes", async () => {
    const ctx = { options: { yes: true }, config: {} };
    await prompt(ctx);
    assert.deepEqual(ctx.config.envSetupSelectedEnvs, []);
  });

  it("skips setup when the user cancels", async () => {
    const mock = mockInquirerQueue([{ envSelection: ["__CANCEL__"] }]);
    try {
      const ctx = { options: {}, config: {} };
      await prompt(ctx);
      assert.deepEqual(ctx.config.envSetupSelectedEnvs, []);
    } finally {
      mock.restore();
    }
  });

  it("re-asks after an empty selection, then stores local", async () => {
    const mock = mockInquirerQueue([
      { envSelection: [] },
      { envSelection: ["local"] },
    ]);
    try {
      const ctx = { options: {}, config: {} };
      await prompt(ctx);
      assert.deepEqual(ctx.config.envSetupSelectedEnvs, ["local"]);
      assert.equal(mock.seen.length, 2);
    } finally {
      mock.restore();
    }
  });

  it("accepts several environments at once", async () => {
    const mock = mockInquirerQueue([
      { envSelection: ["local", "development", "staging"] },
    ]);
    try {
      const ctx = { options: {}, config: {} };
      await prompt(ctx);
      assert.deepEqual(ctx.config.envSetupSelectedEnvs, [
        "local",
        "development",
        "staging",
      ]);
      assert.deepEqual(promptedNames(mock.seen), ["envSelection"]);
    } finally {
      mock.restore();
    }
  });
});
