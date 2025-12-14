const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log } = require("./test-helpers");
const testSetup = require("./test-setup");

// Helper function to create project with maps configuration using stdin
async function createProjectWithMaps({
  name,
  bundleId,
  displayName,
  mapsSelection,
  enableGoogleMaps = false,
  googleMapsApiKey = null,
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
  // Firebase? -> no
  answers += "no\n";
  // Maps selection
  answers += `${mapsSelection}\n`;

  if (mapsSelection === "react-native-maps") {
    // Enable Google Maps?
    answers += `${enableGoogleMaps ? "yes" : "no"}\n`;

    if (enableGoogleMaps) {
      // Google Maps API key
      if (googleMapsApiKey) {
        answers += `${googleMapsApiKey}\n`;
      } else {
        answers += "\n"; // Skip
      }
    }
  }

  // Overwrite? (if exists) -> yes
  answers += "yes\n";

  log(`Creating project ${name} with maps config...`, "info");

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

module.exports = async function runMapsTests() {
  const { DEFAULT_PROJECT, DEFAULT_PROJECT_PATH } = testSetup;

  // Test 1: Maps not selected - react-native-maps should be removed (using DEFAULT_PROJECT)
  test("Check react-native-maps removed when maps not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    if (packageJson.dependencies["react-native-maps"]) {
      throw new Error(
        "react-native-maps found in package.json when maps should be disabled"
      );
    }

    if (packageJson.dependencies["react-native-maps-directions"]) {
      throw new Error(
        "react-native-maps-directions found in package.json when maps should be disabled"
      );
    }
  });

  // Test 2: Maps not selected - Google Maps code should be removed from Podfile
  test("Check Google Maps removed from Podfile when maps not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const podfilePath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile");
    const content = fs.readFileSync(podfilePath, "utf8");

    if (content.includes("react-native-maps/Google")) {
      throw new Error(
        "Google Maps pod found in Podfile when maps should be disabled"
      );
    }

    if (content.includes("Google Maps для react-native-maps")) {
      throw new Error(
        "Google Maps comment found in Podfile when maps should be disabled"
      );
    }
  });

  // Test 3: Maps not selected - Google Maps code should be removed from AppDelegate
  test("Check Google Maps removed from AppDelegate when maps not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const appDelegatePath = path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/AppDelegate.swift`
    );
    const content = fs.readFileSync(appDelegatePath, "utf8");

    if (content.includes("import GoogleMaps")) {
      throw new Error(
        "Google Maps import found in AppDelegate when maps should be disabled"
      );
    }

    if (content.includes("GMSServices.provideAPIKey")) {
      throw new Error(
        "GMSServices.provideAPIKey found in AppDelegate when maps should be disabled"
      );
    }
  });

  // Test 4: Maps not selected - AndroidManifest should have Google Maps commented
  test("Check AndroidManifest has Google Maps commented when maps not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const manifestPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/AndroidManifest.xml"
    );
    const content = fs.readFileSync(manifestPath, "utf8");

    // Should have commented Google Maps API key
    if (
      !content.includes("<!-- Google Maps API Key -->") ||
      !content.includes("<!-- <meta-data")
    ) {
      throw new Error(
        "AndroidManifest should have Google Maps API key commented when maps disabled"
      );
    }

    // Should not have uncommented meta-data
    // Remove all commented sections and check if any uncommented meta-data remains
    // Simple approach: check that meta-data is only found inside comment blocks
    const uncommentedMetaDataPattern =
      /<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"/;

    // Check if there's any meta-data that's not inside a comment
    // We'll do this by checking if meta-data appears without being between <!-- and -->
    const commentBlockPattern =
      /<!--[\s\S]*?<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?-->/;

    // If we find meta-data pattern, it must be inside a comment block
    if (uncommentedMetaDataPattern.test(content)) {
      if (!commentBlockPattern.test(content)) {
        throw new Error(
          "AndroidManifest should not have uncommented Google Maps API key when maps disabled"
        );
      }
    }
  });

  // Test 5: react-native-maps selected, Google Maps not selected - react-native-maps should remain
  test("Check react-native-maps remains when selected but Google Maps disabled", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-no-google",
      bundleId: "com.test.mapsnogoogle",
      displayName: "Maps No Google",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: false,
    });

    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    if (!packageJson.dependencies["react-native-maps"]) {
      throw new Error(
        "react-native-maps not found in package.json when maps should be enabled"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 6: react-native-maps selected, Google Maps not selected - Google Maps should be removed from Podfile
  test("Check Google Maps removed from Podfile when react-native-maps selected but Google Maps disabled", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-no-google-podfile",
      bundleId: "com.test.mapsnogooglepodfile",
      displayName: "Maps No Google Podfile",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: false,
    });

    const podfilePath = path.join(projectPath, "ios/Podfile");
    const content = fs.readFileSync(podfilePath, "utf8");

    if (content.includes("react-native-maps/Google")) {
      throw new Error(
        "Google Maps pod found in Podfile when Google Maps should be disabled"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 7: react-native-maps selected, Google Maps not selected - Google Maps should be removed from AppDelegate
  test("Check Google Maps removed from AppDelegate when react-native-maps selected but Google Maps disabled", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-no-google-appdelegate",
      bundleId: "com.test.mapsnogoogleappdelegate",
      displayName: "Maps No Google AppDelegate",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: false,
    });

    const appDelegatePath = path.join(
      projectPath,
      "ios/test-maps-no-google-appdelegate/AppDelegate.swift"
    );
    const content = fs.readFileSync(appDelegatePath, "utf8");

    if (content.includes("import GoogleMaps")) {
      throw new Error(
        "Google Maps import found in AppDelegate when Google Maps should be disabled"
      );
    }

    if (content.includes("GMSServices.provideAPIKey")) {
      throw new Error(
        "GMSServices.provideAPIKey found in AppDelegate when Google Maps should be disabled"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 8: react-native-maps selected, Google Maps selected, no API key - placeholder should remain
  test("Check Google Maps placeholder remains when API key not provided", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-google-no-key",
      bundleId: "com.test.mapsgooglenokey",
      displayName: "Maps Google No Key",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: true,
      googleMapsApiKey: null,
    });

    // Check AppDelegate has placeholder
    const appDelegatePath = path.join(
      projectPath,
      "ios/test-maps-google-no-key/AppDelegate.swift"
    );
    const appDelegateContent = fs.readFileSync(appDelegatePath, "utf8");

    if (!appDelegateContent.includes("<GOOGLE_MAPS_API_KEY>")) {
      throw new Error(
        "AppDelegate should have Google Maps API key placeholder when key not provided"
      );
    }

    // Check AndroidManifest has commented API key
    const manifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    const manifestContent = fs.readFileSync(manifestPath, "utf8");

    if (
      !manifestContent.includes("<!-- Google Maps API Key -->") ||
      !manifestContent.includes("<!-- <meta-data")
    ) {
      throw new Error(
        "AndroidManifest should have Google Maps API key commented when key not provided"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 9: react-native-maps selected, Google Maps selected, API key provided - should be replaced
  test("Check Google Maps API key replaced when provided", async () => {
    const testApiKey = "TEST_API_KEY_12345";
    const projectPath = await createProjectWithMaps({
      name: "test-maps-google-with-key",
      bundleId: "com.test.mapsgooglewithkey",
      displayName: "Maps Google With Key",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: true,
      googleMapsApiKey: testApiKey,
    });

    // Check AppDelegate has API key
    const appDelegatePath = path.join(
      projectPath,
      "ios/test-maps-google-with-key/AppDelegate.swift"
    );
    const appDelegateContent = fs.readFileSync(appDelegatePath, "utf8");

    if (
      !appDelegateContent.includes(`GMSServices.provideAPIKey("${testApiKey}")`)
    ) {
      throw new Error(
        "AppDelegate should have Google Maps API key replaced when key provided"
      );
    }

    if (appDelegateContent.includes("<GOOGLE_MAPS_API_KEY>")) {
      throw new Error(
        "AppDelegate should not have placeholder when API key provided"
      );
    }

    // Check AndroidManifest has uncommented API key
    const manifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    const manifestContent = fs.readFileSync(manifestPath, "utf8");

    if (!manifestContent.includes(`android:value="${testApiKey}"`)) {
      throw new Error(
        "AndroidManifest should have Google Maps API key when key provided"
      );
    }

    // Should not be commented
    const commentedPattern =
      /<!-- <meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"/;
    if (commentedPattern.test(manifestContent)) {
      throw new Error(
        "AndroidManifest should not have commented Google Maps API key when key provided"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 10: react-native-maps selected, Google Maps selected - Podfile should have Google Maps pod
  test("Check Podfile has Google Maps pod when Google Maps enabled", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-google-podfile",
      bundleId: "com.test.mapsgooglepodfile",
      displayName: "Maps Google Podfile",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: true,
    });

    const podfilePath = path.join(projectPath, "ios/Podfile");
    const content = fs.readFileSync(podfilePath, "utf8");

    if (!content.includes("react-native-maps/Google")) {
      throw new Error(
        "Google Maps pod not found in Podfile when Google Maps should be enabled"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 11: react-native-maps selected, Google Maps selected - AppDelegate should have Google Maps import
  test("Check AppDelegate has Google Maps import when Google Maps enabled", async () => {
    const projectPath = await createProjectWithMaps({
      name: "test-maps-google-appdelegate",
      bundleId: "com.test.mapsgoogleappdelegate",
      displayName: "Maps Google AppDelegate",
      mapsSelection: "react-native-maps",
      enableGoogleMaps: true,
    });

    const appDelegatePath = path.join(
      projectPath,
      "ios/test-maps-google-appdelegate/AppDelegate.swift"
    );
    const content = fs.readFileSync(appDelegatePath, "utf8");

    if (!content.includes("import GoogleMaps")) {
      throw new Error(
        "Google Maps import not found in AppDelegate when Google Maps should be enabled"
      );
    }

    if (!content.includes("GMSServices.provideAPIKey")) {
      throw new Error(
        "GMSServices.provideAPIKey not found in AppDelegate when Google Maps should be enabled"
      );
    }

    // Cleanup
    require("./test-helpers").cleanupPath(projectPath);
  });

  // Test 12: Podfile post_install formatting when Google Maps removed
  test("Check Podfile post_install formatting when Google Maps removed", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const podfilePath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile");

    const content = fs.readFileSync(podfilePath, "utf8");

    // Check that post_install starts on a new line after closing paren
    const postInstallPattern = /\s*\)\s*\n\s*post_install\s+do/;
    if (!postInstallPattern.test(content)) {
      throw new Error(
        "Podfile post_install should start on a new line after closing paren"
      );
    }

    // Check that there's proper spacing (at least one newline before post_install)
    const spacingPattern = /\s*\)\s*\n\s*post_install/;
    if (!spacingPattern.test(content)) {
      throw new Error("Podfile should have proper spacing before post_install");
    }
  });
};