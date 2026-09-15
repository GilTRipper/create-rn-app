const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeConfig } = require("../../src/manifest/sanitize");

function fullConfig() {
  return {
    projectName: "MyApp",
    bundleIdentifier: "com.acme.myapp",
    displayName: "My App",
    packageManager: "pnpm",
    projectPath: "/Users/someone/work/MyApp",
    skipInstall: true,
    skipGit: true,
    skipPods: true,
    autoYes: false,
    fontsDir: "/Users/someone/Downloads/fonts",
    splashScreenDir: "/Users/someone/Downloads/splash",
    appIconDir: null,
    envSetupSelectedEnvs: ["dev", "prod"],
    navigationMode: "with-auth",
    theme: true,
    zustandStorage: true,
    firebase: {
      enabled: true,
      modules: ["analytics", "crashlytics"],
      googleFiles: {
        filesByEnv: {
          dev: {
            iosPlist: "/Users/someone/secrets/dev/GoogleService-Info.plist",
            androidJson: "/Users/someone/secrets/dev/google-services.json",
          },
          prod: {
            iosPlist: "/Users/someone/secrets/prod/GoogleService-Info.plist",
            androidJson: "/Users/someone/secrets/prod/google-services.json",
          },
        },
      },
    },
    maps: {
      enabled: true,
      provider: "google-maps",
      googleMapsApiKey: "AIzaSyTOPSECRETKEY",
      mapboxToken: "pk.topsecrettoken",
    },
    localization: {
      enabled: true,
      defaultLanguage: "en",
      withRemoteConfig: true,
    },
    uiKit: { enabled: true, components: ["turbo-image"] },
  };
}

describe("manifest/sanitize", () => {
  it("keeps everything needed to replay the generation", () => {
    const safe = sanitizeConfig(fullConfig());

    assert.equal(safe.projectName, "MyApp");
    assert.equal(safe.bundleIdentifier, "com.acme.myapp");
    assert.equal(safe.displayName, "My App");
    assert.equal(safe.packageManager, "pnpm");
    assert.deepEqual(safe.envSetupSelectedEnvs, ["dev", "prod"]);
    assert.equal(safe.navigationMode, "with-auth");
    assert.equal(safe.theme, true);
    assert.equal(safe.zustandStorage, true);
    assert.equal(safe.firebase.enabled, true);
    assert.deepEqual(safe.firebase.modules, ["analytics", "crashlytics"]);
    assert.deepEqual(safe.firebase.googleFilesEnvs, ["dev", "prod"]);
    assert.equal(safe.maps.enabled, true);
    assert.equal(safe.maps.provider, "google-maps");
    assert.deepEqual(safe.localization, {
      enabled: true,
      defaultLanguage: "en",
      withRemoteConfig: true,
    });
    assert.deepEqual(safe.uiKit, { enabled: true, components: ["turbo-image"] });
  });

  it("drops secrets, local paths and run flags", () => {
    const serialized = JSON.stringify(sanitizeConfig(fullConfig()));

    for (const secret of [
      "AIzaSyTOPSECRETKEY",
      "pk.topsecrettoken",
      "/Users/someone",
    ]) {
      assert.ok(!serialized.includes(secret), `leaked ${secret}`);
    }

    const safe = sanitizeConfig(fullConfig());
    for (const key of [
      "projectPath",
      "skipInstall",
      "skipGit",
      "skipPods",
      "autoYes",
      "fontsDir",
      "splashScreenDir",
      "appIconDir",
    ]) {
      assert.ok(!(key in safe), `kept ${key}`);
    }
    assert.ok(!("googleFiles" in safe.firebase));
    assert.ok(!("googleMapsApiKey" in safe.maps));
    assert.ok(!("mapboxToken" in safe.maps));
  });

  it("records that custom assets were supplied without recording where", () => {
    const safe = sanitizeConfig(fullConfig());
    assert.deepEqual(safe.assets, {
      fonts: true,
      splashScreen: true,
      appIcon: false,
    });
  });

  it("is an allowlist, so unknown config keys never reach the manifest", () => {
    const config = fullConfig();
    config.someFutureToken = "shhh-secret";
    const safe = sanitizeConfig(config);

    assert.ok(!("someFutureToken" in safe));
    assert.ok(!JSON.stringify(safe).includes("shhh-secret"));
  });

  it("normalizes a bare config from a fully skipped run", () => {
    const safe = sanitizeConfig({
      projectName: "Bare",
      bundleIdentifier: "com.bare.app",
      displayName: "Bare",
      packageManager: "npm",
    });

    assert.deepEqual(safe.envSetupSelectedEnvs, []);
    assert.equal(safe.navigationMode, "none");
    assert.equal(safe.theme, false);
    assert.equal(safe.zustandStorage, false);
    assert.deepEqual(safe.firebase, {
      enabled: false,
      modules: [],
      googleFilesEnvs: [],
    });
    assert.deepEqual(safe.maps, { enabled: false, provider: null });
    assert.deepEqual(safe.uiKit, { enabled: false, components: [] });
    assert.deepEqual(safe.assets, {
      fonts: false,
      splashScreen: false,
      appIcon: false,
    });
  });
});
