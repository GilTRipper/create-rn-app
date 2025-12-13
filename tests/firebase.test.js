const fs = require("fs");
const path = require("path");
const { test } = require("./test-helpers");
const testSetup = require("./test-setup");

module.exports = function runFirebaseTests() {
  const { DEFAULT_PROJECT, NO_ENV_NO_FIREBASE_PROJECT } = testSetup;

  // Test 23: Firebase not included by default
  test("Check Firebase dependencies not included when not enabled", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    const firebaseDeps = Object.keys(packageJson.dependencies || {}).filter(
      dep => dep.startsWith("@react-native-firebase/")
    );

    if (firebaseDeps.length > 0) {
      throw new Error(
        `Firebase dependencies found when Firebase should not be enabled: ${firebaseDeps.join(
          ", "
        )}`
      );
    }
  });

  // Test 25: GoogleService-Info.plist not in Xcode project when Firebase disabled
  test("Check GoogleService-Info.plist not in Xcode project when Firebase disabled", () => {
    const { NO_ENV_NO_FIREBASE_PROJECT_PATH } = testSetup;
    if (!NO_ENV_NO_FIREBASE_PROJECT_PATH) {
      throw new Error("NO_ENV_NO_FIREBASE_PROJECT_PATH is not initialized");
    }

    const pbxprojPath = path.join(
      NO_ENV_NO_FIREBASE_PROJECT_PATH,
      `ios/${NO_ENV_NO_FIREBASE_PROJECT.name}.xcodeproj/project.pbxproj`
    );

    if (!fs.existsSync(pbxprojPath)) {
      throw new Error("project.pbxproj not found");
    }

    const content = fs.readFileSync(pbxprojPath, "utf8");

    // Check that GoogleService-Info.plist is not referenced
    if (content.includes("GoogleService-Info.plist")) {
      throw new Error(
        "GoogleService-Info.plist found in project.pbxproj when Firebase should be disabled"
      );
    }

    // Check that GoogleServices folder is not referenced
    if (
      content.includes("GoogleServices") &&
      content.includes("PBXFileSystemSynchronizedRootGroup")
    ) {
      throw new Error(
        "GoogleServices folder found in project.pbxproj when Firebase should be disabled"
      );
    }
  });

  // Test 27: Podfile doesn't have Firebase pods when Firebase disabled
  test("Check Podfile doesn't have Firebase pods when Firebase disabled", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const podfilePath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile");

    if (!fs.existsSync(podfilePath)) {
      throw new Error("Podfile not found");
    }

    const content = fs.readFileSync(podfilePath, "utf8");

    // Check that Firebase pods are not present
    const firebasePods = [
      "FirebaseCore",
      "FirebaseRemoteConfig",
      "FirebaseMessaging",
      "FirebaseAnalytics",
    ];

    for (const pod of firebasePods) {
      if (content.includes(`pod '${pod}'`)) {
        throw new Error(
          `Firebase pod ${pod} found in Podfile when Firebase should be disabled`
        );
      }
    }

    // Check that Google Services plugin is not in Android build.gradle
    const androidBuildGradlePath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/build.gradle"
    );

    if (fs.existsSync(androidBuildGradlePath)) {
      const androidBuildGradleContent = fs.readFileSync(
        androidBuildGradlePath,
        "utf8"
      );

      if (
        androidBuildGradleContent.includes("com.google.gms:google-services")
      ) {
        throw new Error(
          "Google Services plugin found in android/build.gradle when Firebase should be disabled"
        );
      }
    }

    // Check that Google Services plugin is not applied in app/build.gradle
    const appBuildGradlePath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/build.gradle"
    );

    if (fs.existsSync(appBuildGradlePath)) {
      const appBuildGradleContent = fs.readFileSync(appBuildGradlePath, "utf8");

      if (appBuildGradleContent.includes("com.google.gms.google-services")) {
        throw new Error(
          "Google Services plugin applied in android/app/build.gradle when Firebase should be disabled"
        );
      }
    }
  });

  // Test 28: AppDelegate doesn't have Firebase imports when Firebase disabled
  test("Check AppDelegate doesn't have Firebase when Firebase disabled", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const appDelegatePath = path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/AppDelegate.swift`
    );

    if (!fs.existsSync(appDelegatePath)) {
      throw new Error("AppDelegate.swift not found");
    }

    const content = fs.readFileSync(appDelegatePath, "utf8");

    if (content.includes("import Firebase")) {
      throw new Error(
        "Firebase import found in AppDelegate.swift when Firebase should be disabled"
      );
    }

    if (content.includes("FirebaseApp.configure()")) {
      throw new Error(
        "FirebaseApp.configure() found in AppDelegate.swift when Firebase should be disabled"
      );
    }
  });
};
