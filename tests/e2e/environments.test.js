const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readJson, readText } = require("../helpers/fs");
const { listSchemes, readScheme, flavorApplicationIds } = require("../helpers/schemes");

describe("environments: staging", () => {
  let projectName;
  let projectPath;
  let bundleIdentifier;
  let displayName;

  before(async () => {
    const generated = await generateProject("e2e-envs-staging", {
      envSetupSelectedEnvs: ["staging"],
      bundleIdentifier: "com.test.envstaging",
      displayName: "Env Staging",
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
    bundleIdentifier = generated.config.bundleIdentifier;
    displayName = generated.config.displayName;
  });

  after(() => cleanup(projectPath));

  it("writes env files and Android flavors with unique applicationIds", () => {
    assert.ok(exists(projectPath, ".env.staging"));
    assert.ok(exists(projectPath, ".env.production"));

    const gradle = readText(projectPath, "android/app/build.gradle");
    assert.ok(gradle.includes("project.ext.envConfigFiles"));
    assert.ok(gradle.includes("productFlavors"));
    assert.ok(gradle.includes("flavorDimensions"));
    assert.ok(gradle.includes("matchingFallbacks"));

    const productionId = gradle.match(/production\s*\{[\s\S]*?applicationId\s+"([^"]+)"/);
    const stagingId = gradle.match(/staging\s*\{[\s\S]*?applicationId\s+"([^"]+)"/);
    assert.ok(productionId);
    assert.ok(stagingId);
    assert.notEqual(productionId[1], stagingId[1]);
    assert.ok(stagingId[1].includes(productionId[1]));
    assert.equal(productionId[1], bundleIdentifier);

    const stagingStrings = readText(
      projectPath,
      "android/app/src/staging/res/values/strings.xml"
    );
    assert.ok(stagingStrings.includes("Staging"));
    assert.ok(stagingStrings.includes(displayName) || stagingStrings.includes("app_name"));
  });

  it("adds env run scripts and iOS schemes when they are generated", () => {
    const scripts = readJson(projectPath, "package.json").scripts;
    assert.ok(scripts["android:staging"]);
    assert.ok(scripts["android:prod"]);
    assert.ok(scripts["ios:staging"].includes(`--scheme '${projectName}Staging'`));
    assert.ok(scripts["ios:prod"].includes(`--scheme '${projectName}'`));

    const schemes = listSchemes(projectPath, projectName);
    assert.ok(schemes.includes(`${projectName}.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Staging.xcscheme`));
    assert.ok(!schemes.some(file => /helloworld/i.test(file)));

    const production = readScheme(projectPath, projectName, `${projectName}.xcscheme`);
    const staging = readScheme(projectPath, projectName, `${projectName}Staging.xcscheme`);
    assert.ok(production.includes(".env.production"));
    assert.ok(staging.includes(".env.staging"));
    assert.ok(staging.includes("BuildableReference"));
    assert.ok(staging.includes(`${projectName}Staging.app`));
  });
});

describe("environments: local only", () => {
  let projectName;
  let projectPath;
  let bundleIdentifier;

  before(async () => {
    const generated = await generateProject("e2e-envs-local", {
      envSetupSelectedEnvs: ["local"],
      bundleIdentifier: "com.test.envlocal",
      displayName: "Env Local",
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
    bundleIdentifier = generated.config.bundleIdentifier;
  });

  after(() => cleanup(projectPath));

  it("adds production plus a .local flavor and Local scheme", () => {
    assert.ok(exists(projectPath, ".env.local"));
    assert.ok(exists(projectPath, ".env.production"));
    assert.ok(exists(projectPath, "android/app/src/local/res/values/strings.xml"));
    assert.ok(readText(projectPath, "android/app/src/local/res/values/strings.xml").includes("Local"));

    const ids = flavorApplicationIds(readText(projectPath, "android/app/build.gradle"));
    assert.equal(ids.production, bundleIdentifier);
    assert.equal(ids.local, `${bundleIdentifier}.local`);

    const schemes = listSchemes(projectPath, projectName);
    assert.deepEqual(schemes, [`${projectName}.xcscheme`, `${projectName}Local.xcscheme`].sort());
    assert.ok(readScheme(projectPath, projectName, `${projectName}Local.xcscheme`).includes(".env.local"));
  });
});

describe("environments: local + development + staging", () => {
  const selected = ["local", "development", "staging"];
  let projectName;
  let projectPath;
  let bundleIdentifier;

  before(async () => {
    const generated = await generateProject("e2e-envs-multi", {
      envSetupSelectedEnvs: selected,
      bundleIdentifier: "com.test.envmulti",
      displayName: "Env Multi",
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
    bundleIdentifier = generated.config.bundleIdentifier;
  });

  after(() => cleanup(projectPath));

  it("always writes production env files and unique flavor applicationIds", () => {
    for (const env of [...selected, "production"]) {
      assert.ok(exists(projectPath, `.env.${env}`), `missing .env.${env}`);
    }

    const gradle = readText(projectPath, "android/app/build.gradle");
    const ids = flavorApplicationIds(gradle);
    assert.deepEqual(ids, {
      production: bundleIdentifier,
      local: `${bundleIdentifier}.local`,
      development: `${bundleIdentifier}.dev`,
      staging: `${bundleIdentifier}.staging`,
    });
    assert.equal(new Set(Object.values(ids)).size, 4);

    assert.ok(exists(projectPath, "android/app/src/local"));
    assert.ok(exists(projectPath, "android/app/src/development"));
    assert.ok(exists(projectPath, "android/app/src/staging"));
    assert.equal(exists(projectPath, "android/app/src/production"), false);

    const scripts = readJson(projectPath, "package.json").scripts;
    assert.ok(scripts["android:local"]);
    assert.ok(scripts["android:development"]);
    assert.ok(scripts["android:staging"]);
    assert.ok(scripts["android:prod"]);
    assert.ok(scripts["ios:local"].includes(`${projectName}Local`));
    assert.ok(scripts["ios:development"].includes(`${projectName}Development`));
    assert.ok(scripts["ios:staging"].includes(`${projectName}Staging`));
    assert.ok(scripts["ios:prod"].includes(`--scheme '${projectName}'`));
  });

  it("creates one Xcode scheme per env plus production, each copying its .env", () => {
    const schemes = listSchemes(projectPath, projectName);
    assert.ok(!schemes.some(file => /helloworld/i.test(file)));
    assert.ok(schemes.includes(`${projectName}.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Local.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Development.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Staging.xcscheme`));

    const expected = {
      [`${projectName}.xcscheme`]: ".env.production",
      [`${projectName}Local.xcscheme`]: ".env.local",
      [`${projectName}Development.xcscheme`]: ".env.development",
      [`${projectName}Staging.xcscheme`]: ".env.staging",
    };
    for (const [schemeFile, envFile] of Object.entries(expected)) {
      const content = readScheme(projectPath, projectName, schemeFile);
      assert.ok(content.includes(envFile), `${schemeFile} should copy ${envFile}`);
      assert.ok(content.includes("BuildableReference"));
      assert.ok(content.includes("<Scheme"));
    }

    const localScheme = readScheme(projectPath, projectName, `${projectName}Local.xcscheme`);
    assert.ok(localScheme.includes(`${projectName}Local.app`));
    const developmentScheme = readScheme(
      projectPath,
      projectName,
      `${projectName}Development.xcscheme`
    );
    assert.ok(developmentScheme.includes(`${projectName}Development.app`));
  });
});
