const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  generateProject,
  cleanup,
  prepareIconsDir,
  prepareIconsDirWithEnvs,
} = require("../helpers/generate");
const { exists, readText, findIosAppDir } = require("../helpers/fs");

const ENVS = ["development", "staging"];

describe("app icons per environment", () => {
  let projectPath;
  let projectName;
  let output;

  before(async () => {
    const generated = await generateProject(
      "e2e-icons-envs",
      {
        bundleIdentifier: "com.test.e2eiconsenvs",
        envSetupSelectedEnvs: ENVS,
        // `qa` matches no environment and must be reported, not silently dropped.
        appIconDir: prepareIconsDirWithEnvs(ENVS, ["qa"]),
      },
      { capture: true }
    );
    projectPath = generated.projectPath;
    projectName = generated.projectName;
    output = generated.output;
  });

  after(() => cleanup(projectPath));

  // Gradle merges a flavor's res/ over main, so per-environment icons need no
  // build file changes at all.
  it("puts each environment's Android icons in its own flavor", () => {
    for (const env of ["main", ...ENVS]) {
      assert.ok(
        exists(projectPath, `android/app/src/${env}/res/mipmap-hdpi/ic_launcher.png`),
        `missing icons for ${env}`
      );
    }
  });

  it("gives each environment its own iOS icon set", () => {
    const catalog = path.join(
      projectPath,
      "ios",
      findIosAppDir(projectPath),
      "Images.xcassets"
    );
    const sets = fs.readdirSync(catalog).filter(name => name.endsWith(".appiconset"));

    assert.deepEqual(sets.sort(), [
      "AppIcon.appiconset",
      "AppIconDevelopment.appiconset",
      "AppIconStaging.appiconset",
    ]);

    // Without Contents.json Xcode ignores the set entirely.
    for (const set of sets) {
      assert.ok(
        fs.existsSync(path.join(catalog, set, "Contents.json")),
        `${set} has no Contents.json`
      );
    }
  });

  it("points every environment target at its own set", () => {
    const pbxproj = readText(
      projectPath,
      "ios",
      `${projectName}.xcodeproj`,
      "project.pbxproj"
    );

    for (const env of ENVS) {
      const capitalized = env.charAt(0).toUpperCase() + env.slice(1);
      assert.match(
        pbxproj,
        new RegExp(`ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon${capitalized};`),
        `${env} target keeps the default icon set`
      );
    }

    // The base target keeps the shared set.
    assert.match(pbxproj, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/);
  });

  it("says which folders it ignored instead of dropping them quietly", () => {
    assert.match(output, /Ignored icon folders that match no environment: qa/);
  });
});

describe("app icons without environments", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-icons-flat", {
      bundleIdentifier: "com.test.e2eiconsflat",
      appIconDir: prepareIconsDirWithEnvs(),
    }));
  });

  after(() => cleanup(projectPath));

  // The layout that already shipped has to keep working exactly as it did.
  it("still copies a single set into main and the default catalog", () => {
    assert.ok(
      exists(projectPath, "android/app/src/main/res/mipmap-hdpi/ic_launcher.png")
    );
    const catalog = path.join(
      projectPath,
      "ios",
      findIosAppDir(projectPath),
      "Images.xcassets"
    );
    assert.deepEqual(
      fs.readdirSync(catalog).filter(name => name.endsWith(".appiconset")),
      ["AppIcon.appiconset"]
    );
  });

  it("creates no flavor directories", () => {
    assert.deepEqual(fs.readdirSync(path.join(projectPath, "android/app/src")), [
      "main",
    ]);
  });
});

// environments/android.js copies the whole of main/ into every flavour, and it
// runs before assets are copied. Writing a shared icon only into main left
// every dev and staging build on the stock React Native icon.
describe("shared app icons reach every flavour", () => {
  let projectPath;
  const envs = ["development", "staging"];

  before(async () => {
    ({ projectPath } = await generateProject("e2e-icons-shared", {
      bundleIdentifier: "com.test.e2eiconsshared",
      envSetupSelectedEnvs: envs,
      // No per-environment folders at all: one set for everyone.
      appIconDir: prepareIconsDir(),
    }));
  });

  after(() => cleanup(projectPath));

  it("gives every flavour the shared icon, not the template default", () => {
    const icon = flavor =>
      fs.readFileSync(
        path.join(
          projectPath,
          `android/app/src/${flavor}/res/mipmap-hdpi/ic_launcher.png`
        )
      );

    const shared = icon("main");
    for (const env of envs) {
      assert.deepEqual(icon(env), shared, `${env} kept the template icon`);
    }
  });
});

describe("a flavour with its own icons keeps them", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-icons-mixed", {
      bundleIdentifier: "com.test.e2eiconsmixed",
      envSetupSelectedEnvs: ["development", "staging"],
      appIconDir: prepareIconsDirWithEnvs(["development"]),
    }));
  });

  after(() => cleanup(projectPath));

  it("only overwrites the flavours that brought nothing of their own", () => {
    const icon = flavor =>
      fs.readFileSync(
        path.join(
          projectPath,
          `android/app/src/${flavor}/res/mipmap-hdpi/ic_launcher.png`
        )
      );

    // staging has no folder, so it inherits the shared set.
    assert.deepEqual(icon("staging"), icon("main"));
    // development brought its own, which must survive.
    assert.ok(fs.existsSync(path.join(projectPath, "android/app/src/development/res")));
  });
});
