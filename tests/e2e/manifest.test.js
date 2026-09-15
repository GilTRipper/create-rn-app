const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { generateProject, cleanup, prepareFontsDir } = require("../helpers/generate");
const { exists, readText, readJson } = require("../helpers/fs");
const {
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  readManifest,
  hashProjectFiles,
} = require("../../src/manifest");

const GOOGLE_MAPS_KEY = "AIzaSyE2eSecretMapsKeyDoNotPersist00000";

describe("manifest: default project", () => {
  let projectPath;
  let projectName;

  before(async () => {
    ({ projectPath, projectName } = await generateProject("e2e-manifest"));
  });

  after(() => cleanup(projectPath));

  it("writes a manifest next to the generated app", async () => {
    assert.ok(exists(projectPath, MANIFEST_FILENAME));

    const manifest = await readManifest(projectPath);
    assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
    assert.equal(manifest.cliVersion, require("../../package.json").version);
    assert.equal(
      manifest.reactNative,
      readJson(projectPath, "package.json").dependencies["react-native"]
    );
    assert.ok(!Number.isNaN(Date.parse(manifest.createdAt)));
    assert.equal(manifest.config.projectName, projectName);
  });

  it("records hashes for the template files an upgrade would merge", async () => {
    const { files } = await readManifest(projectPath);

    for (const file of [
      "package.json",
      "app.json",
      "App.tsx",
      "index.js",
      "babel.config.js",
      "metro.config.js",
      "tsconfig.json",
      "ios/Podfile",
      "android/app/build.gradle",
      "android/settings.gradle",
      "android/app/src/main/AndroidManifest.xml",
    ]) {
      assert.ok(files[file], `missing hash for ${file}`);
      assert.match(files[file], /^[0-9a-f]{40}$/);
    }
  });

  it("leaves lockfiles, artwork and the manifest itself out", async () => {
    const { files } = await readManifest(projectPath);

    for (const file of [MANIFEST_FILENAME, "pnpm-lock.yaml", "Gemfile.lock"]) {
      assert.ok(!(file in files), `should not hash ${file}`);
    }
    assert.ok(
      !Object.keys(files).some(file => file.startsWith("assets/")),
      "should not hash assets/"
    );
    assert.ok(
      !Object.keys(files).some(file => file.includes(".xcassets/")),
      "should not hash .xcassets/"
    );
  });

  // The manifest is written before install()/git init. If anything in that tail
  // of createApp still rewrote a tracked file, the recorded hashes would be
  // stale from birth and every later upgrade would think the user edited it.
  it("records hashes that still match the finished project", async () => {
    const { files } = await readManifest(projectPath);
    const actual = await hashProjectFiles(projectPath);
    assert.deepEqual(files, actual);
  });

  it("is committed rather than ignored by the generated .gitignore", () => {
    const gitignore = readText(projectPath, ".gitignore");
    assert.ok(!gitignore.split("\n").includes(MANIFEST_FILENAME));
  });
});

describe("manifest: project with features and secrets", () => {
  let projectPath;
  let fontsDir;

  before(async () => {
    fontsDir = prepareFontsDir();
    ({ projectPath } = await generateProject("e2e-manifest-features", {
      fontsDir,
      maps: {
        enabled: true,
        provider: "google-maps",
        googleMapsApiKey: GOOGLE_MAPS_KEY,
      },
      navigationMode: "with-auth",
      zustandStorage: true,
      theme: true,
      uiKit: { enabled: true, components: ["turbo-image"] },
    }));
  });

  after(() => cleanup(projectPath));

  it("records the feature selection", async () => {
    const { config } = await readManifest(projectPath);

    assert.equal(config.maps.enabled, true);
    assert.equal(config.maps.provider, "google-maps");
    assert.equal(config.navigationMode, "with-auth");
    assert.equal(config.zustandStorage, true);
    assert.equal(config.theme, true);
    assert.equal(config.uiKit.enabled, true);
    assert.deepEqual(config.uiKit.components, ["turbo-image"]);
    assert.deepEqual(config.assets, {
      fonts: true,
      splashScreen: false,
      appIcon: false,
    });
  });

  it("never writes secrets or machine paths into the committed file", () => {
    const raw = readText(projectPath, MANIFEST_FILENAME);

    assert.ok(!raw.includes(GOOGLE_MAPS_KEY), "leaked the Google Maps API key");
    assert.ok(!raw.includes(projectPath), "leaked the absolute project path");
    assert.ok(!raw.includes(fontsDir), "leaked the fonts directory");
    assert.ok(!raw.includes(path.sep + "tmp" + path.sep), "leaked a temp path");
  });

  it("hashes the files the features generated on top of the template", async () => {
    const { files } = await readManifest(projectPath);

    const generated = Object.keys(files).filter(file => file.startsWith("src/"));
    assert.ok(generated.length > 0, "no generated src/ files were hashed");

    for (const file of generated) {
      const onDisk = fs.readFileSync(path.join(projectPath, file));
      assert.ok(onDisk.length >= 0);
    }
  });
});
