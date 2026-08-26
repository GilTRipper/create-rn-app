const fs = require("fs");
const path = require("path");
const { createApp } = require("../src/template");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

function writeDummyFirebaseFiles(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>BUNDLE_ID</key>
  <string>com.test.app</string>
  <key>GOOGLE_APP_ID</key>
  <string>1:123456789:ios:abcdef</string>
</dict>
</plist>`;

  const jsonContent = JSON.stringify({
    project_info: { project_id: "test-project" },
    client: [],
    configuration_version: "1",
  });

  fs.writeFileSync(path.join(dirPath, "GoogleService-Info.plist"), plistContent);
  fs.writeFileSync(path.join(dirPath, "google-services.json"), jsonContent);
}

function createDummyFirebaseConfigsByEnv(baseDir, envs) {
  fs.mkdirSync(baseDir, { recursive: true });
  for (const env of envs) {
    writeDummyFirebaseFiles(path.join(baseDir, env.toLowerCase()));
  }
}

function googleFilesByEnv(baseDir, envs) {
  const filesByEnv = {};
  for (const env of envs) {
    const envDir = path.join(baseDir, env.toLowerCase());
    filesByEnv[env] = {
      iosPlist: path.join(envDir, "GoogleService-Info.plist"),
      androidJson: path.join(envDir, "google-services.json"),
    };
  }
  return filesByEnv;
}

function readPodfile(projectPath) {
  return fs.readFileSync(path.join(projectPath, "ios/Podfile"), "utf8");
}

function readAppDelegate(projectPath) {
  const iosDir = path.join(projectPath, "ios");
  const appDir = fs.readdirSync(iosDir).find(entry => {
    const full = path.join(iosDir, entry);
    return (
      fs.statSync(full).isDirectory() &&
      fs.existsSync(path.join(full, "AppDelegate.swift"))
    );
  });
  if (!appDir) {
    throw new Error("AppDelegate.swift not found");
  }
  return fs.readFileSync(path.join(iosDir, appDir, "AppDelegate.swift"), "utf8");
}

async function generateProject({ name, bundleId, displayName, extra }) {
  const projectPath = path.join("/tmp", name);
  cleanupPath(projectPath);
  log(`Generating project ${name} via createApp()...`, "info");

  await createApp({
    projectName: name,
    projectPath,
    bundleIdentifier: bundleId,
    displayName,
    packageManager: testSetup.packageManager,
    skipInstall: true,
    skipGit: true,
    skipPods: true,
    autoYes: false,
    splashScreenDir: null,
    appIconDir: null,
    fontsDir: null,
    envSetupSelectedEnvs: extra.envSetupSelectedEnvs || [],
    firebase: extra.firebase || { enabled: false, modules: [], googleFiles: { filesByEnv: {} } },
    maps: extra.maps || { enabled: false, provider: null },
    zustandStorage: false,
    navigationMode: "none",
    localization: { enabled: false },
    theme: false,
    uiKit: extra.uiKit || { enabled: false, components: [] },
  });

  return projectPath;
}

module.exports = async function runEnvFirebaseTests() {
  await test("Check environments without Firebase omit Firebase pods", async () => {
    const projectPath = await generateProject({
      name: "test-envs-no-firebase",
      bundleId: "com.test.envsnofirebase",
      displayName: "Envs No Firebase",
      extra: {
        envSetupSelectedEnvs: ["staging"],
      },
    });

    const podfile = readPodfile(projectPath);
    if (podfile.includes("$RNFirebaseDisableSPM")) {
      throw new Error(
        "Environments without Firebase should not set $RNFirebaseDisableSPM"
      );
    }
    if (podfile.includes("pod 'FirebaseCore'")) {
      throw new Error("Environments without Firebase should not add FirebaseCore");
    }

    const buildGradle = fs.readFileSync(
      path.join(projectPath, "android/app/build.gradle"),
      "utf8"
    );
    if (!buildGradle.includes("productFlavors") || !buildGradle.includes("envConfigFiles")) {
      throw new Error("Android flavors should be generated when environments are selected");
    }

    const stagingEnv = path.join(projectPath, ".env.staging");
    if (!fs.existsSync(stagingEnv)) {
      throw new Error(".env.staging should exist when staging environment is selected");
    }

    cleanupPath(projectPath);
  });

  await test("Check environments with Firebase keep SPM opt-out and per-env Google files", async () => {
    const firebaseConfigDir = path.join("/tmp", "firebase-config-test-envs-firebase");
    createDummyFirebaseConfigsByEnv(firebaseConfigDir, ["production", "staging"]);

    let projectPath;
    try {
      projectPath = await generateProject({
        name: "test-envs-firebase",
        bundleId: "com.test.envsfirebase",
        displayName: "Envs Firebase",
        extra: {
          envSetupSelectedEnvs: ["staging"],
          firebase: {
            enabled: true,
            modules: ["analytics", "remote-config"],
            googleFiles: {
              filesByEnv: googleFilesByEnv(firebaseConfigDir, [
                "production",
                "staging",
              ]),
            },
          },
        },
      });
    } finally {
      cleanupPath(firebaseConfigDir);
    }

    const podfile = readPodfile(projectPath);
    if (!podfile.includes("$RNFirebaseDisableSPM = true")) {
      throw new Error("Multi-env Firebase Podfile should disable SPM");
    }
    if (!podfile.includes("$RNFirebaseAnalyticsWithoutAdIdSupport = true")) {
      throw new Error("Analytics flag should survive the multi-env Podfile rewrite");
    }
    if (!podfile.includes("pod 'FirebaseCore'")) {
      throw new Error("FirebaseCore pod missing from multi-env Podfile");
    }
    if (!podfile.includes("pod 'FirebaseRemoteConfig'")) {
      throw new Error("Remote Config pods should be present when remote-config is selected");
    }

    const productionJson = path.join(projectPath, "android/app/google-services.json");
    const stagingJson = path.join(
      projectPath,
      "android/app/src/staging/google-services.json"
    );
    if (!fs.existsSync(productionJson)) {
      throw new Error("Production google-services.json should be in android/app");
    }
    if (!fs.existsSync(stagingJson)) {
      throw new Error("Staging google-services.json should be in android/app/src/staging");
    }

    const productionPlist = path.join(
      projectPath,
      "ios/GoogleServices/production/GoogleService-Info.plist"
    );
    const stagingPlist = path.join(
      projectPath,
      "ios/GoogleServices/staging/GoogleService-Info.plist"
    );
    if (!fs.existsSync(productionPlist) || !fs.existsSync(stagingPlist)) {
      throw new Error("iOS GoogleServices/<env> plists should exist for multi-env Firebase");
    }

    cleanupPath(projectPath);
  });

  await test("Check Firebase stays in AppDelegate when maps are skipped", async () => {
    const firebaseConfigDir = path.join("/tmp", "firebase-config-test-firebase-no-maps");
    writeDummyFirebaseFiles(firebaseConfigDir);

    let projectPath;
    try {
      projectPath = await generateProject({
        name: "test-firebase-no-maps",
        bundleId: "com.test.firebasenomaps",
        displayName: "Firebase No Maps",
        extra: {
          firebase: {
            enabled: true,
            modules: ["analytics"],
            googleFiles: {
              filesByEnv: {
                production: {
                  iosPlist: path.join(firebaseConfigDir, "GoogleService-Info.plist"),
                  androidJson: path.join(firebaseConfigDir, "google-services.json"),
                },
              },
            },
          },
          maps: { enabled: false, provider: null },
        },
      });
    } finally {
      cleanupPath(firebaseConfigDir);
    }

    const appDelegate = readAppDelegate(projectPath);
    if (!appDelegate.includes("import Firebase")) {
      throw new Error("Firebase import should remain when maps are skipped");
    }
    if (!appDelegate.includes("FirebaseApp.configure()")) {
      throw new Error("FirebaseApp.configure() should remain when maps are skipped");
    }
    if (appDelegate.includes("import GoogleMaps")) {
      throw new Error("GoogleMaps import should be removed when maps are skipped");
    }
    if (appDelegate.includes("GMSServices.provideAPIKey")) {
      throw new Error("GMSServices should be removed when maps are skipped");
    }

    cleanupPath(projectPath);
  });
};
