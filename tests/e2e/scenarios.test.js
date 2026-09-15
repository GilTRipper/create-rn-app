const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { selectedScenarios } = require("../helpers/scenarios");
const { CHECKS } = require("../helpers/expectations");
const verify = require("../helpers/verify");

const MINUTE = 60 * 1000;

for (const scenario of selectedScenarios()) {
  describe(`scenario: ${scenario.title}`, () => {
    let generated = null;
    let tempDirs = [];
    let installed = false;

    before(async () => {
      const built = scenario.build();
      tempDirs = built.tempDirs;
      generated = await generateProject(`e2e-${scenario.name}`, built.overrides, {
        capture: true,
      });
    });

    after(() => {
      if (generated) {
        cleanup(generated.projectPath);
      }
      tempDirs.forEach(cleanup);
    });

    it("generates without printing an error", () => {
      const errors = generated.output
        .split("\n")
        .filter(line => line.includes("❌"))
        .map(line => line.trim());
      assert.deepEqual(errors, [], `createApp reported errors:\n${errors.join("\n")}`);
    });

    for (const [name, check] of CHECKS) {
      it(`holds the ${name} invariants`, () => {
        check(generated);
      });
    }

    if (verify.deepEnabled()) {
      it("has a usable toolchain for deep checks", () => {
        assert.deepEqual(verify.preflight(), []);
      });

      it("installs dependencies", { timeout: 25 * MINUTE }, () => {
        const result = verify.installDependencies(generated.projectPath);
        assert.ok(result.ok, result.message);
        installed = true;
      });

      const afterInstall = (label, fn, timeout) =>
        it(label, { timeout }, t => {
          if (!installed) {
            return t.skip("dependencies were not installed");
          }
          const result = fn();
          assert.ok(result.ok, result.message);
        });

      afterInstall("type-checks with tsc --noEmit", () => verify.typecheck(generated.projectPath), 12 * MINUTE);
      afterInstall("lints clean", () => verify.lint(generated.projectPath), 12 * MINUTE);
      afterInstall("bundles for ios", () => verify.bundle(generated.projectPath, "ios"), 18 * MINUTE);
      afterInstall("bundles for android", () => verify.bundle(generated.projectPath, "android"), 18 * MINUTE);

      if (verify.podInstallEnabled()) {
        afterInstall("installs pods", () => verify.podInstall(generated.projectPath), 35 * MINUTE);
      }
      if (verify.gradleEnabled()) {
        afterInstall("assembles the Android debug build", () => verify.gradleAssemble(generated.projectPath), 50 * MINUTE);
      }
    }
  });
}
