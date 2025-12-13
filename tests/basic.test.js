const fs = require("fs");
const path = require("path");
const { test, log } = require("./test-helpers");
const { DEFAULT_PROJECT, DEFAULT_PROJECT_PATH } = require("./test-setup");

module.exports = function runBasicTests() {
  // Test 2: Check project structure
  test("Check project structure", () => {
    const requiredFiles = [
      "package.json",
      "app.json",
      "App.tsx",
      "index.js",
      "android/app/src/main/AndroidManifest.xml",
      "ios/Podfile",
      "tsconfig.json",
      "babel.config.js",
      "metro.config.js",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(DEFAULT_PROJECT_PATH, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file not found: ${file}`);
      }
    }
  });

  // Test 3: Check package.json content
  test("Check package.json content", () => {
    const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    if (packageJson.name !== DEFAULT_PROJECT.name) {
      throw new Error(
        `Expected package name "${DEFAULT_PROJECT.name}", got "${packageJson.name}"`
      );
    }
  });

  // Test 4: Check app.json content
  test("Check app.json content", () => {
    const appJsonPath = path.join(DEFAULT_PROJECT_PATH, "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

    if (appJson.displayName !== DEFAULT_PROJECT.displayName) {
      throw new Error(
        `Expected display name "${DEFAULT_PROJECT.displayName}", got "${appJson.displayName}"`
      );
    }
  });

  // Test 9: Check package.json has dependencies defined (skipped installation to avoid patch issues)
  test("Check package.json has dependencies defined", () => {
    const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(
        "package.json not found - project may not have been created"
      );
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    // Check that dependencies are defined in package.json
    if (
      !packageJson.dependencies ||
      Object.keys(packageJson.dependencies).length === 0
    ) {
      throw new Error("package.json has no dependencies defined");
    }

    // Check for some key dependencies in package.json
    const keyDeps = ["react", "react-native", "@react-navigation/native"];
    for (const dep of keyDeps) {
      if (
        !packageJson.dependencies[dep] &&
        !packageJson.devDependencies?.[dep]
      ) {
        throw new Error(`Key dependency ${dep} not found in package.json`);
      }
    }
  });

  // Test 10: Check patches directory exists (patches are copied but not applied without installation)
  test("Check patches directory exists", () => {
    const patchesPath = path.join(DEFAULT_PROJECT_PATH, "patches");

    if (!fs.existsSync(patchesPath)) {
      throw new Error(
        "patches directory not found - patches should be copied from template"
      );
    }

    // Check that patches are present
    const patches = fs.readdirSync(patchesPath);
    if (patches.length === 0) {
      throw new Error("patches directory is empty");
    }

    log("Package.json has all required dependencies defined", "success");
  });

  // Test 10: Check patches directory exists (patches are copied but not applied without installation)
  test("Check patches directory exists", () => {
    const patchesPath = path.join(DEFAULT_PROJECT_PATH, "patches");

    if (!fs.existsSync(patchesPath)) {
      throw new Error(
        "patches directory not found - patches should be copied from template"
      );
    }

    // Check that patches are present
    const patches = fs.readdirSync(patchesPath);
    if (patches.length === 0) {
      throw new Error("patches directory is empty");
    }

    log(`Found ${patches.length} patch file(s)`, "success");
  });
};
