const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { test } = require("./test-helpers");
const testSetup = require("./test-setup");

module.exports = function runIosTests() {
  const { DEFAULT_PROJECT, NO_ENV_NO_FIREBASE_PROJECT, testPods } = testSetup;

  // Test 5: Check Podfile has correct target name
  test("Check Podfile has correct target name", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }
    const podfilePath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile");
    const podfileContent = fs.readFileSync(podfilePath, "utf8");

    if (!podfileContent.includes(`target '${DEFAULT_PROJECT.name}'`)) {
      throw new Error(
        `Podfile missing correct target name "${DEFAULT_PROJECT.name}"`
      );
    }
  });

  // Test 7: Check iOS project structure
  test("Check iOS project structure", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const iosFiles = [
      `ios/${DEFAULT_PROJECT.name}/Info.plist`,
      `ios/${DEFAULT_PROJECT.name}.xcodeproj/project.pbxproj`,
      `ios/${DEFAULT_PROJECT.name}.xcworkspace/contents.xcworkspacedata`,
    ];

    for (const file of iosFiles) {
      const filePath = path.join(DEFAULT_PROJECT_PATH, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`iOS file not found: ${file}`);
      }
    }
  });

  // Test 13: iOS display name set in Info.plist
  test("Check iOS Info.plist display name", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const plistPath = path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/Info.plist`
    );
    const content = fs.readFileSync(plistPath, "utf8");
    if (
      !content.includes(
        `<key>CFBundleDisplayName</key>\n\t<string>${DEFAULT_PROJECT.displayName}</string>`
      )
    ) {
      throw new Error("CFBundleDisplayName not set to displayName");
    }
    if (
      !content.includes(
        `<key>CFBundleName</key>\n\t<string>${DEFAULT_PROJECT.displayName}</string>`
      )
    ) {
      throw new Error("CFBundleName not set to displayName");
    }
  });

  // Test 29: AppDelegate withModuleName is replaced correctly
  test("Check AppDelegate withModuleName is replaced correctly", () => {
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

    // Check that withModuleName is present
    if (!content.includes("withModuleName")) {
      throw new Error("withModuleName not found in AppDelegate.swift");
    }

    // Check that "helloworld" is NOT present
    if (content.includes('withModuleName: "helloworld"')) {
      throw new Error(
        `withModuleName still contains "helloworld" instead of project name`
      );
    }

    // Check that project name (lowercase) is present in withModuleName
    const projectNameLower = DEFAULT_PROJECT.name.toLowerCase();
    const expectedModuleName = `withModuleName: "${projectNameLower}"`;
    if (!content.includes(expectedModuleName)) {
      // Also check alternative formats (with or without quotes in different positions)
      const alternativePattern = new RegExp(
        `withModuleName:\\s*"${projectNameLower}"`,
        "g"
      );
      if (!alternativePattern.test(content)) {
        throw new Error(
          `withModuleName should be "${projectNameLower}" but found: ${
            content.match(/withModuleName:\s*"[^"]+"/)?.[0] || "not found"
          }`
        );
      }
    }
  });

  // Test 11: Test pods installation (only on macOS)
  if (testPods && process.platform === "darwin") {
    test("Check iOS CocoaPods installation", () => {
      const { DEFAULT_PROJECT_PATH } = testSetup;
      if (!DEFAULT_PROJECT_PATH) {
        throw new Error("DEFAULT_PROJECT_PATH is not initialized");
      }

      const podsPath = path.join(DEFAULT_PROJECT_PATH, "ios/Pods");
      const podfileLockPath = path.join(
        DEFAULT_PROJECT_PATH,
        "ios/Podfile.lock"
      );

      // Pods might not be installed if --skip-pods was used, so we just check if the command would work
      // by checking if CocoaPods is available
      try {
        execSync("which pod", { stdio: "pipe" });
      } catch (error) {
        throw new Error("CocoaPods is not installed or not available");
      }

      // If Pods directory exists, check it's not empty
      if (fs.existsSync(podsPath)) {
        const pods = fs.readdirSync(podsPath);
        if (pods.length === 0) {
          throw new Error("Pods directory exists but is empty");
        }
      }
    });
  }
};
