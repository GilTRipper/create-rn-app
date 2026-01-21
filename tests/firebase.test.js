const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

// Helper to create dummy Firebase config files for testing
function createDummyFirebaseConfigs(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });

  // Create minimal GoogleService-Info.plist
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CLIENT_ID</key>
  <string>test-client-id.apps.googleusercontent.com</string>
  <key>REVERSED_CLIENT_ID</key>
  <string>com.googleusercontent.apps.test-client-id</string>
  <key>API_KEY</key>
  <string>test-api-key</string>
  <key>GCM_SENDER_ID</key>
  <string>123456789</string>
  <key>PLIST_VERSION</key>
  <string>1</string>
  <key>BUNDLE_ID</key>
  <string>com.test.app</string>
  <key>PROJECT_ID</key>
  <string>test-project</string>
  <key>STORAGE_BUCKET</key>
  <string>test-project.appspot.com</string>
  <key>IS_ADS_ENABLED</key>
  <false></false>
  <key>IS_ANALYTICS_ENABLED</key>
  <false></false>
  <key>IS_APPINVITE_ENABLED</key>
  <true></true>
  <key>IS_GCM_ENABLED</key>
  <true></true>
  <key>IS_SIGNIN_ENABLED</key>
  <true></true>
  <key>GOOGLE_APP_ID</key>
  <string>1:123456789:ios:abcdef</string>
</dict>
</plist>`;

  // Create minimal google-services.json
  const jsonContent = JSON.stringify({
    project_info: {
      project_number: "123456789",
      firebase_url: "https://test-project.firebaseio.com",
      project_id: "test-project",
      storage_bucket: "test-project.appspot.com",
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: "1:123456789:android:abcdef",
          android_client_info: {
            package_name: "com.test.app",
          },
        },
        oauth_client: [],
        api_key: [
          {
            current_key: "test-api-key",
          },
        ],
        services: {
          appinvite_service: {
            other_platform_oauth_client: [],
          },
        },
      },
    ],
    configuration_version: "1",
  });

  fs.writeFileSync(
    path.join(dirPath, "GoogleService-Info.plist"),
    plistContent
  );
  fs.writeFileSync(path.join(dirPath, "google-services.json"), jsonContent);
}

// Helper function to create project with Firebase configuration using stdin
async function createProjectWithFirebase({
  name,
  bundleId,
  displayName,
  firebaseModules = [],
}) {
  const projectPath = path.join("/tmp", name);
  const packageManager = testSetup.packageManager;

  // Build command
  const command = `create-rn-app`;
  const args = [
    name,
    "-p",
    packageManager,
    "--bundle-id",
    bundleId,
    "--display-name",
    displayName,
    "--skip-git",
    "--skip-install",
  ];

  // Prepare answers for interactive prompts
  let answers = "";

  // Splash screen? -> skip (Enter)
  answers += "\n";
  // App icon? -> skip (Enter)
  answers += "\n";
  // Fonts? -> skip (Enter)
  answers += "\n";
  // Environments? -> Cancel
  answers += "__CANCEL__\n";
  // Firebase? -> yes
  answers += "yes\n";

  // Select Firebase modules (checkbox prompt)
  // For inquirer checkbox: default is ["analytics"], so:
  // - If we want analytics only: just press Enter
  // - If we want remote-config: down arrow, space (to deselect analytics and select remote-config), Enter
  // - If we want both: down arrow, space (select remote-config), Enter
  // Order in choices: analytics (default selected), remote-config, messaging
  // Actually, simpler: send space to toggle each item, then Enter
  // Default has analytics selected, so:
  // - For analytics only: Enter (keep default)
  // - For remote-config only: space (deselect analytics), down arrow, space (select remote-config), Enter
  // - For both: down arrow, space (add remote-config), Enter
  if (firebaseModules.length > 0) {
    const hasAnalytics = firebaseModules.includes("analytics");
    const hasRemoteConfig = firebaseModules.includes("remote-config");
    const hasMessaging = firebaseModules.includes("messaging");

    // Default selection is analytics, so:
    if (!hasAnalytics && hasRemoteConfig) {
      // Deselect analytics (space), then select remote-config
      answers += " "; // Deselect analytics (first item)
      answers += "\u001B[B"; // Down arrow to remote-config
      answers += " "; // Select remote-config
      if (hasMessaging) {
        answers += "\u001B[B"; // Down arrow to messaging
        answers += " "; // Select messaging
      }
    } else if (hasAnalytics && !hasRemoteConfig && !hasMessaging) {
      // Just analytics (default) - do nothing, just Enter
    } else if (hasAnalytics && hasRemoteConfig) {
      // Both analytics and remote-config
      answers += "\u001B[B"; // Down arrow to remote-config
      answers += " "; // Select remote-config
      if (hasMessaging) {
        answers += "\u001B[B"; // Down arrow to messaging
        answers += " "; // Select messaging
      }
    }
    // Confirm selection
    answers += "\n";
  } else {
    // No modules selected - deselect default analytics, then Enter
    answers += " \n"; // Space to deselect, Enter to confirm
  }

  // Create temporary Firebase config directory with dummy files
  const firebaseConfigDir = path.join("/tmp", `firebase-config-${name}`);
  createDummyFirebaseConfigs(firebaseConfigDir);
  answers += `${firebaseConfigDir}\n`;

  // Maps? -> Cancel
  answers += "__CANCEL__\n";
  // Zustand storage? -> no
  answers += "no\n";
  // Navigation? -> no
  answers += "no\n";
  // Localization? -> no
  answers += "no\n";
  // Theme? -> no
  answers += "no\n";
  // Overwrite? (if exists) -> yes
  answers += "yes\n";

  log(`Creating project ${name} with Firebase config...`, "info");

  return new Promise((resolve, reject) => {
    let isResolvedOrRejected = false;
    let timeout = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const child = spawn(command, args, {
      cwd: "/tmp",
      stdio: ["pipe", "inherit", "inherit"],
      env: { ...process.env, CI: "true" },
      shell: true,
    });

    child.stdin.write(answers);
    child.stdin.end();

    timeout = setTimeout(() => {
      if (!isResolvedOrRejected && !child.killed) {
        isResolvedOrRejected = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
        cleanup();
        reject(new Error("Process timed out after 120 seconds"));
      }
    }, 120000);

    child.on("close", code => {
      if (isResolvedOrRejected) {
        return; // Already handled by timeout or error
      }
      isResolvedOrRejected = true;
      cleanup();

      // Cleanup temporary Firebase config directory
      if (fs.existsSync(firebaseConfigDir)) {
        try {
          fs.rmSync(firebaseConfigDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}`));
        return;
      }
      if (!fs.existsSync(projectPath)) {
        reject(new Error("Project directory was not created"));
        return;
      }
      resolve(projectPath);
    });

    child.on("error", error => {
      if (isResolvedOrRejected) {
        return; // Already handled by timeout
      }
      isResolvedOrRejected = true;
      cleanup();
      reject(new Error(`Failed to spawn process: ${error.message}`));
    });
  });
}

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

  // Test: Firebase lib modules not created when Firebase disabled
  test("Check Firebase lib modules not created when Firebase disabled", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const libPath = path.join(DEFAULT_PROJECT_PATH, "src/lib");
    const analyticsPath = path.join(libPath, "analytics");
    const remoteConfigPath = path.join(libPath, "remote-config");

    if (fs.existsSync(analyticsPath)) {
      throw new Error(
        "analytics lib module found when Firebase should be disabled"
      );
    }

    if (fs.existsSync(remoteConfigPath)) {
      throw new Error(
        "remote-config lib module found when Firebase should be disabled"
      );
    }
  });

  // Test: Analytics lib module created when analytics selected
  test("Check analytics lib module created when analytics selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-analytics",
      bundleId: "com.test.firebaseanalytics",
      displayName: "Firebase Analytics",
      firebaseModules: ["analytics"],
    });

    const analyticsPath = path.join(projectPath, "src/lib/analytics");
    if (!fs.existsSync(analyticsPath)) {
      throw new Error("analytics lib module directory was not created");
    }

    // Check that all required files exist
    const requiredFiles = [
      "index.ts",
      "implementation.ts",
      "interface.ts",
      "types.ts",
      "useAnalytics.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(analyticsPath, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file ${file} not found in analytics module`);
      }
    }

    // Check that index.ts exports are correct
    const indexContent = fs.readFileSync(
      path.join(analyticsPath, "index.ts"),
      "utf8"
    );
    if (!indexContent.includes("export * from")) {
      throw new Error("analytics index.ts does not contain expected exports");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test: Remote-config lib module created when remote-config selected
  test("Check remote-config lib module created when remote-config selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-remote-config",
      bundleId: "com.test.firebaseremoteconfig",
      displayName: "Firebase Remote Config",
      firebaseModules: ["remote-config"],
    });

    const remoteConfigPath = path.join(projectPath, "src/lib/remote-config");
    if (!fs.existsSync(remoteConfigPath)) {
      throw new Error("remote-config lib module directory was not created");
    }

    // Check that all required files exist
    const requiredFiles = [
      "index.ts",
      "implementation.ts",
      "interface.ts",
      "types.ts",
      "useRemoteConfig.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(remoteConfigPath, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Required file ${file} not found in remote-config module`
        );
      }
    }

    // Check that index.ts exports are correct
    const indexContent = fs.readFileSync(
      path.join(remoteConfigPath, "index.ts"),
      "utf8"
    );
    if (!indexContent.includes("export")) {
      throw new Error(
        "remote-config index.ts does not contain expected exports"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test: Both analytics and remote-config created when both selected
  test("Check both analytics and remote-config lib modules created when both selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-both",
      bundleId: "com.test.firebaseboth",
      displayName: "Firebase Both",
      firebaseModules: ["analytics", "remote-config"],
    });

    const libPath = path.join(projectPath, "src/lib");
    const analyticsPath = path.join(libPath, "analytics");
    const remoteConfigPath = path.join(libPath, "remote-config");

    if (!fs.existsSync(analyticsPath)) {
      throw new Error("analytics lib module directory was not created");
    }

    if (!fs.existsSync(remoteConfigPath)) {
      throw new Error("remote-config lib module directory was not created");
    }

    // Check analytics files
    const analyticsFiles = [
      "index.ts",
      "implementation.ts",
      "interface.ts",
      "types.ts",
      "useAnalytics.ts",
    ];
    for (const file of analyticsFiles) {
      if (!fs.existsSync(path.join(analyticsPath, file))) {
        throw new Error(`analytics/${file} not found`);
      }
    }

    // Check remote-config files
    const remoteConfigFiles = [
      "index.ts",
      "implementation.ts",
      "interface.ts",
      "types.ts",
      "useRemoteConfig.ts",
    ];
    for (const file of remoteConfigFiles) {
      if (!fs.existsSync(path.join(remoteConfigPath, file))) {
        throw new Error(`remote-config/${file} not found`);
      }
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test: Only selected module created (analytics only, not remote-config)
  test("Check only analytics created when only analytics selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-analytics-only",
      bundleId: "com.test.firebaseanalyticsonly",
      displayName: "Firebase Analytics Only",
      firebaseModules: ["analytics"],
    });

    const libPath = path.join(projectPath, "src/lib");
    const analyticsPath = path.join(libPath, "analytics");
    const remoteConfigPath = path.join(libPath, "remote-config");

    if (!fs.existsSync(analyticsPath)) {
      throw new Error("analytics lib module directory was not created");
    }

    if (fs.existsSync(remoteConfigPath)) {
      throw new Error(
        "remote-config lib module should not be created when only analytics selected"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test: Only selected module created (remote-config only, not analytics)
  test("Check only remote-config created when only remote-config selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-remote-config-only",
      bundleId: "com.test.firebaseremoteconfigonly",
      displayName: "Firebase Remote Config Only",
      firebaseModules: ["remote-config"],
    });

    const libPath = path.join(projectPath, "src/lib");
    const analyticsPath = path.join(libPath, "analytics");
    const remoteConfigPath = path.join(libPath, "remote-config");

    if (!fs.existsSync(remoteConfigPath)) {
      throw new Error("remote-config lib module directory was not created");
    }

    if (fs.existsSync(analyticsPath)) {
      throw new Error(
        "analytics lib module should not be created when only remote-config selected"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test: Messaging dependency and notifications preset created when messaging selected
  test("Check messaging dependency and notifications preset created when messaging selected", async () => {
    const projectPath = await createProjectWithFirebase({
      name: "test-firebase-messaging",
      bundleId: "com.test.firebasemessaging",
      displayName: "Firebase Messaging",
      firebaseModules: ["messaging"],
    });

    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const deps = packageJson.dependencies || {};

    if (!deps["@react-native-firebase/messaging"]) {
      throw new Error(
        "@react-native-firebase/messaging should be added to dependencies when messaging selected"
      );
    }

    const notificationsDir = path.join(projectPath, "src/notifications");
    if (!fs.existsSync(notificationsDir)) {
      throw new Error("src/notifications directory should be created for messaging");
    }

    const requiredFiles = [
      "index.ts",
      "interface.ts",
      "service.ts",
      "hooks/index.ts",
      "hooks/usePushNotifications.ts",
      "hooks/useHandlePushNotificationToken.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(notificationsDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required notifications file not found: ${file}`);
      }
    }

    // Android: POST_NOTIFICATIONS permission should be enabled in main manifest
    const androidManifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    if (!fs.existsSync(androidManifestPath)) {
      throw new Error("AndroidManifest.xml not found for main flavor");
    }
    const manifestContent = fs.readFileSync(androidManifestPath, "utf8");
    if (
      !manifestContent.includes(
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
      )
    ) {
      throw new Error(
        "android.permission.POST_NOTIFICATIONS should be enabled in main AndroidManifest.xml when messaging selected"
      );
    }

    // iOS: Info.plist should have UIBackgroundModes remote-notification
    const infoPlistPath = path.join(
      projectPath,
      `ios/${"Firebase Messaging" ? "FirebaseMessaging" : "FirebaseMessaging"}/Info.plist`
    );
    // Project name is the CLI name, not displayName
    const iosDir = path.join(projectPath, "ios");
    const iosEntries = fs.readdirSync(iosDir);
    const appDir = iosEntries.find(entry =>
      fs.statSync(path.join(iosDir, entry)).isDirectory()
    );
    const appInfoPlistPath = path.join(iosDir, appDir, "Info.plist");

    if (!fs.existsSync(appInfoPlistPath)) {
      throw new Error("iOS Info.plist not found");
    }
    const infoContent = fs.readFileSync(appInfoPlistPath, "utf8");
    if (
      !infoContent.includes("<key>UIBackgroundModes</key>") ||
      !infoContent.includes("<string>remote-notification</string>")
    ) {
      throw new Error(
        "Info.plist should include UIBackgroundModes with remote-notification when messaging selected"
      );
    }

    cleanupPath(projectPath);
  });
};
