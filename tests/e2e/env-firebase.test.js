const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const {
  generateProject,
  cleanup,
  writeDummyFirebaseFiles,
  firebaseFilesByEnv,
  uniqueName,
} = require("../helpers/generate");
const { exists, readText, readAppDelegate } = require("../helpers/fs");
const { listSchemes, readScheme, flavorApplicationIds } = require("../helpers/schemes");

describe("environments without Firebase", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-envs", {
      envSetupSelectedEnvs: ["staging"],
    }));
  });

  after(() => cleanup(projectPath));

  it("adds Android flavors and .env.staging without Firebase pods", () => {
    const podfile = readText(projectPath, "ios/Podfile");
    assert.ok(!podfile.includes("$RNFirebaseDisableSPM"));
    assert.ok(!podfile.includes("pod 'FirebaseCore'"));

    const gradle = readText(projectPath, "android/app/build.gradle");
    assert.ok(gradle.includes("productFlavors"));
    assert.ok(gradle.includes("envConfigFiles"));
    assert.ok(exists(projectPath, ".env.staging"));
  });
});

describe("environments with Firebase", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-envs-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-envs-fb", {
      envSetupSelectedEnvs: ["staging"],
      firebase: {
        enabled: true,
        modules: ["analytics", "remote-config"],
        googleFiles: {
          filesByEnv: firebaseFilesByEnv(configDir, ["production", "staging"]),
        },
      },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("keeps SPM opt-out and per-env Google files", () => {
    const podfile = readText(projectPath, "ios/Podfile");
    assert.ok(podfile.includes("$RNFirebaseDisableSPM = true"));
    assert.ok(podfile.includes("$RNFirebaseAnalyticsWithoutAdIdSupport = true"));
    assert.ok(podfile.includes("pod 'FirebaseCore'"));
    assert.ok(podfile.includes("pod 'FirebaseRemoteConfig'"));

    assert.ok(exists(projectPath, "android/app/google-services.json"));
    assert.ok(exists(projectPath, "android/app/src/staging/google-services.json"));
    assert.ok(exists(projectPath, "ios/GoogleServices/production/GoogleService-Info.plist"));
    assert.ok(exists(projectPath, "ios/GoogleServices/staging/GoogleService-Info.plist"));
  });
});

describe("local + development + staging with Firebase", () => {
  const selected = ["local", "development", "staging"];
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-multi-cfg"));
  let projectName;
  let projectPath;
  let bundleIdentifier;

  before(async () => {
    const generated = await generateProject("e2e-envs-fb-multi", {
      envSetupSelectedEnvs: selected,
      bundleIdentifier: "com.test.envfbmulti",
      displayName: "Env Firebase Multi",
      firebase: {
        enabled: true,
        modules: ["analytics"],
        googleFiles: {
          filesByEnv: firebaseFilesByEnv(configDir, ["production", ...selected]),
        },
      },
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
    bundleIdentifier = generated.config.bundleIdentifier;
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("copies Google files per environment on Android and iOS", () => {
    assert.ok(exists(projectPath, "android/app/google-services.json"));
    for (const env of selected) {
      assert.ok(
        exists(projectPath, "android/app/src", env, "google-services.json"),
        `missing android google-services for ${env}`
      );
      assert.ok(
        exists(projectPath, "ios/GoogleServices", env, "GoogleService-Info.plist"),
        `missing iOS plist for ${env}`
      );
    }
    assert.ok(
      exists(projectPath, "ios/GoogleServices/production/GoogleService-Info.plist")
    );

    const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
    assert.ok(pbxproj.includes("GoogleServices"));
  });

  it("keeps unique flavor ids and Xcode schemes wired to each .env", () => {
    const ids = flavorApplicationIds(readText(projectPath, "android/app/build.gradle"));
    assert.equal(ids.production, bundleIdentifier);
    assert.equal(ids.local, `${bundleIdentifier}.local`);
    assert.equal(ids.development, `${bundleIdentifier}.dev`);
    assert.equal(ids.staging, `${bundleIdentifier}.staging`);

    const schemes = listSchemes(projectPath, projectName);
    assert.ok(schemes.includes(`${projectName}.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Local.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Development.xcscheme`));
    assert.ok(schemes.includes(`${projectName}Staging.xcscheme`));

    assert.ok(
      readScheme(projectPath, projectName, `${projectName}.xcscheme`).includes(".env.production")
    );
    assert.ok(
      readScheme(projectPath, projectName, `${projectName}Local.xcscheme`).includes(".env.local")
    );
    assert.ok(
      readScheme(projectPath, projectName, `${projectName}Development.xcscheme`).includes(
        ".env.development"
      )
    );
    assert.ok(
      readScheme(projectPath, projectName, `${projectName}Staging.xcscheme`).includes(".env.staging")
    );

    const podfile = readText(projectPath, "ios/Podfile");
    assert.ok(podfile.includes("$RNFirebaseDisableSPM = true"));
    assert.ok(podfile.includes("pod 'FirebaseCore'"));
  });
});

describe("Firebase without maps", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-nomaps-cfg"));
  let projectPath;

  before(async () => {
    writeDummyFirebaseFiles(configDir);
    ({ projectPath } = await generateProject("e2e-fb-nomaps", {
      firebase: {
        enabled: true,
        modules: ["analytics"],
        googleFiles: {
          filesByEnv: {
            production: {
              iosPlist: path.join(configDir, "GoogleService-Info.plist"),
              androidJson: path.join(configDir, "google-services.json"),
            },
          },
        },
      },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("keeps Firebase and strips Google Maps from AppDelegate", () => {
    const appDelegate = readAppDelegate(projectPath);
    assert.ok(appDelegate.includes("import Firebase"));
    assert.ok(appDelegate.includes("FirebaseApp.configure()"));
    assert.ok(!appDelegate.includes("import GoogleMaps"));
    assert.ok(!appDelegate.includes("GMSServices.provideAPIKey"));
  });
});
