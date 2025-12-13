const fs = require("fs");
const path = require("path");
const { test } = require("./test-helpers");
const { DEFAULT_PROJECT, DEFAULT_PROJECT_PATH } = require("./test-setup");

module.exports = function runAndroidTests() {
  // Test 8: Check Android package structure
  test("Check Android package structure", () => {
    const bundleParts = DEFAULT_PROJECT.bundleId.split(".");
    const javaPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/java",
      ...bundleParts
    );

    const requiredKotlinFiles = ["MainActivity.kt", "MainApplication.kt"];

    for (const file of requiredKotlinFiles) {
      const filePath = path.join(javaPath, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Android Kotlin file not found: ${file}`);
      }
    }
  });

  // Test 14: Android strings.xml app_name uses display name
  test("Check Android app_name equals display name", () => {
    const stringsPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/res/values/strings.xml"
    );
    const content = fs.readFileSync(stringsPath, "utf8");
    if (
      !content.includes(
        `<string name="app_name">${DEFAULT_PROJECT.displayName}</string>`
      )
    ) {
      throw new Error("Android app_name not set to displayName");
    }
  });

  // Test 26: Android applicationId correctly set in build.gradle
  test("Check Android applicationId in build.gradle defaultConfig", () => {
    const buildGradlePath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/build.gradle"
    );

    if (!fs.existsSync(buildGradlePath)) {
      throw new Error("android/app/build.gradle does not exist");
    }

    const content = fs.readFileSync(buildGradlePath, "utf8");

    // Find defaultConfig block
    const defaultConfigMatch = content.match(/defaultConfig\s*\{([\s\S]*?)\}/);
    if (!defaultConfigMatch) {
      throw new Error("defaultConfig block not found in build.gradle");
    }

    const defaultConfigContent = defaultConfigMatch[1];

    // Check that applicationId is set correctly
    const applicationIdRegex = /applicationId\s+"([^"]+)"/;
    const applicationIdMatch = defaultConfigContent.match(applicationIdRegex);

    if (!applicationIdMatch) {
      throw new Error("applicationId not found in defaultConfig");
    }

    const applicationId = applicationIdMatch[1];

    if (applicationId !== DEFAULT_PROJECT.bundleId) {
      throw new Error(
        `Expected applicationId "${DEFAULT_PROJECT.bundleId}", got "${applicationId}"`
      );
    }

    // Also check namespace
    const namespaceRegex = /namespace\s+"([^"]+)"/;
    const namespaceMatch = content.match(namespaceRegex);

    if (!namespaceMatch) {
      throw new Error("namespace not found in build.gradle");
    }

    const namespace = namespaceMatch[1];

    if (namespace !== DEFAULT_PROJECT.bundleId) {
      throw new Error(
        `Expected namespace "${DEFAULT_PROJECT.bundleId}", got "${namespace}"`
      );
    }
  });
};
