const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  collectQuestions,
  applyAnswers,
} = require("../../src/core/project-prompt");

function makeCtx(overrides = {}) {
  return {
    projectNameArg: overrides.projectNameArg,
    options: overrides.options || {},
    questions: [],
    config: {},
  };
}

function question(ctx, name) {
  return ctx.questions.find(item => item.name === name);
}

describe("collectQuestions", () => {
  it("asks for name, bundle id, display name, package manager, and install", () => {
    const ctx = makeCtx();
    collectQuestions(ctx);
    assert.deepEqual(
      ctx.questions.map(item => item.name),
      [
        "projectName",
        "bundleIdentifier",
        "displayName",
        "packageManager",
        "installDependencies",
      ]
    );
  });

  it("skips questions already answered by CLI flags and --yes", () => {
    const ctx = makeCtx({
      projectNameArg: "FlagApp",
      options: {
        bundleId: "com.flag.app",
        displayName: "Flag",
        packageManager: "npm",
        yes: true,
      },
    });
    collectQuestions(ctx);
    assert.deepEqual(ctx.questions, []);
  });

  it("rejects empty project names and invalid bundle ids", () => {
    const ctx = makeCtx();
    collectQuestions(ctx);

    assert.equal(question(ctx, "projectName").validate(""), "Project name is required");
    assert.equal(question(ctx, "projectName").validate("  "), "Project name is required");
    assert.equal(question(ctx, "projectName").validate("MyApp"), true);

    const bundleValidate = question(ctx, "bundleIdentifier").validate;
    assert.equal(bundleValidate("com.company.app"), true);
    assert.equal(
      bundleValidate("Com.Company.App"),
      "Bundle identifier must be in format: com.company.app"
    );
    assert.equal(
      bundleValidate("invalid"),
      "Bundle identifier must be in format: com.company.app"
    );
    assert.equal(
      bundleValidate("com."),
      "Bundle identifier must be in format: com.company.app"
    );
  });

  it("defaults bundle id and display name from the project name", () => {
    const ctx = makeCtx({ projectNameArg: "ShopApp" });
    collectQuestions(ctx);
    assert.equal(question(ctx, "bundleIdentifier").default({}), "com.shopapp");
    assert.equal(question(ctx, "displayName").default({}), "ShopApp");
  });
});

describe("applyAnswers", () => {
  it("prefers CLI options over prompt answers", () => {
    const ctx = makeCtx({
      projectNameArg: "FromArg",
      options: {
        bundleId: "com.from.flag",
        displayName: "From Flag",
        packageManager: "yarn",
        skipInstall: true,
        skipGit: true,
        skipPods: true,
        yes: true,
      },
    });
    applyAnswers(ctx, {
      projectName: "FromAnswers",
      bundleIdentifier: "com.from.answers",
      displayName: "From Answers",
      packageManager: "pnpm",
      installDependencies: true,
    });

    assert.equal(ctx.config.projectName, "FromArg");
    assert.equal(ctx.config.bundleIdentifier, "com.from.flag");
    assert.equal(ctx.config.displayName, "From Flag");
    assert.equal(ctx.config.packageManager, "yarn");
    assert.equal(ctx.config.skipInstall, true);
    assert.equal(ctx.config.skipGit, true);
    assert.equal(ctx.config.skipPods, true);
    assert.equal(ctx.config.autoYes, true);
    assert.equal(ctx.config.projectPath, path.join(process.cwd(), "FromArg"));
  });

  it("with --yes installs dependencies unless --skip-install is set", () => {
    const yesCtx = makeCtx({
      projectNameArg: "YesInstall",
      options: { yes: true, bundleId: "com.yes.install", displayName: "Yes" },
    });
    applyAnswers(yesCtx, {});
    assert.equal(yesCtx.config.skipInstall, false);
    assert.equal(yesCtx.config.autoYes, true);
    assert.equal(yesCtx.config.packageManager, "pnpm");
  });

  it("honors the install confirm when --yes is off", () => {
    const ctx = makeCtx({
      projectNameArg: "Manual",
      options: { bundleId: "com.manual.app", displayName: "Manual" },
    });
    applyAnswers(ctx, { installDependencies: false, packageManager: "npm" });
    assert.equal(ctx.config.skipInstall, true);
    assert.equal(ctx.config.packageManager, "npm");
    assert.equal(ctx.config.autoYes, false);
  });
});
