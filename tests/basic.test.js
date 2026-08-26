const fs = require("fs");
const path = require("path");
const { test, log } = require("./test-helpers");
const testSetup = require("./test-setup");

module.exports = function runBasicTests() {
  const { DEFAULT_PROJECT } = testSetup;

  // Test 2: Check project structure
  test("Check project structure", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

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
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

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
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

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
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

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

    if (packageJson.dependencies["react-native-turbo-image"]) {
      throw new Error(
        "react-native-turbo-image should only be added when the UI kit is selected"
      );
    }

    if (packageJson.dependencies["@callstack/liquid-glass"]) {
      throw new Error(
        "@callstack/liquid-glass should only be added when the UI kit is selected"
      );
    }

    if (packageJson.dependencies["@d11/react-native-fast-image"]) {
      throw new Error(
        "@d11/react-native-fast-image should have been removed in favor of TurboImage"
      );
    }

    if (packageJson.dependencies["react-native"] !== "0.86.2") {
      throw new Error(
        `Expected react-native 0.86.2, got ${packageJson.dependencies["react-native"]}`
      );
    }

    if (packageJson.dependencies.react !== "19.2.3") {
      throw new Error(`Expected react 19.2.3, got ${packageJson.dependencies.react}`);
    }

    if (packageJson.engines?.node !== ">= 22.11.0") {
      throw new Error(
        `Expected engines.node ">= 22.11.0", got ${packageJson.engines?.node}`
      );
    }

    const gestureHandler = packageJson.dependencies["react-native-gesture-handler"] || "";
    if (!gestureHandler.startsWith("^2.")) {
      throw new Error(
        `Gesture Handler should stay on 2.x, got ${gestureHandler}`
      );
    }

    const nitro = packageJson.dependencies["react-native-nitro-modules"] || "";
    if (!nitro.includes("0.35.")) {
      throw new Error(`Nitro Modules should stay on 0.35.x, got ${nitro}`);
    }

    const patched = packageJson.pnpm?.patchedDependencies || {};
    const patchKeys = Object.keys(patched);
    if (!patchKeys.includes("react-native-date-picker@5.0.13")) {
      throw new Error("date-picker patch missing from pnpm.patchedDependencies");
    }
    if (patchKeys.some(key => key.includes("netinfo"))) {
      throw new Error("netinfo should not be in pnpm.patchedDependencies");
    }
  });

  // Test 10: Check patches directory exists (patches are copied but not applied without installation)
  test("Check patches directory exists", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const patchesPath = path.join(DEFAULT_PROJECT_PATH, "patches");

    if (!fs.existsSync(patchesPath)) {
      throw new Error(
        "patches directory not found - patches should be copied from template"
      );
    }

    // Check that patches are present
    const patches = fs.readdirSync(patchesPath).filter(name => name.endsWith(".patch"));
    if (patches.length === 0) {
      throw new Error("patches directory is empty");
    }

    if (!patches.includes("react-native-date-picker@5.0.13.patch")) {
      throw new Error("react-native-date-picker patch is missing");
    }

    if (patches.some(name => name.includes("netinfo"))) {
      throw new Error("netinfo patch should have been removed after upgrading to v12");
    }

    log(`Found ${patches.length} patch file(s)`, "success");
  });

  test("Check UI kit is skipped by default", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const atomFiles = [
      "src/ui/components/atoms/TurboImage.tsx",
      "src/ui/components/atoms/LiquidGlassView.tsx",
      "src/ui/components/atoms/index.ts",
    ];

    for (const file of atomFiles) {
      const filePath = path.join(DEFAULT_PROJECT_PATH, file);
      if (fs.existsSync(filePath)) {
        throw new Error(`UI kit file should not be generated by default: ${file}`);
      }
    }

    const babelConfigPath = path.join(DEFAULT_PROJECT_PATH, "babel.config.js");
    const babelConfig = fs.readFileSync(babelConfigPath, "utf8");
    const workletsIndex = babelConfig.lastIndexOf("react-native-worklets/plugin");
    const lastPluginIndex = Math.max(
      babelConfig.lastIndexOf("babel-plugin-root-import"),
      babelConfig.lastIndexOf("@babel/plugin-transform-export-namespace-from")
    );
    if (workletsIndex < lastPluginIndex) {
      throw new Error("react-native-worklets/plugin must be the last Babel plugin");
    }
  });

  test("Check RN 0.86 native tooling", () => {
    const { DEFAULT_PROJECT_PATH } = testSetup;
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const wrapperPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/gradle/wrapper/gradle-wrapper.properties"
    );
    const wrapper = fs.readFileSync(wrapperPath, "utf8");
    if (!wrapper.includes("gradle-9.3.1-bin.zip")) {
      throw new Error("Gradle wrapper should be 9.3.1");
    }

    const podfile = fs.readFileSync(
      path.join(DEFAULT_PROJECT_PATH, "ios/Podfile"),
      "utf8"
    );
    if (!podfile.includes("platform :ios, min_ios_version_supported")) {
      throw new Error("Podfile should use min_ios_version_supported");
    }
    if (podfile.includes("$RNFirebaseDisableSPM")) {
      throw new Error(
        "Default --yes project should not set $RNFirebaseDisableSPM without Firebase"
      );
    }
  });
};
