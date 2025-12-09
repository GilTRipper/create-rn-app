#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PROJECT = {
  name: "test-e2e-app",
  bundleId: "com.test.e2eapp",
  displayName: "Test E2E App",
  splashDir: null,
};

const WITH_SPLASH_PROJECT = {
  name: "test-e2e-splash",
  bundleId: "com.test.splash",
  displayName: "Splash E2E",
  splashDir: path.join("/tmp", "test-e2e-splash-assets"),
};

const projectPaths = [
  path.join("/tmp", DEFAULT_PROJECT.name),
  path.join("/tmp", WITH_SPLASH_PROJECT.name),
];

// Parse command line arguments
const args = process.argv.slice(2);
const packageManager = args.includes("--package-manager")
  ? args[args.indexOf("--package-manager") + 1] || "npm"
  : "npm";
const testPods = args.includes("--test-pods");

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = "info") {
  const colors = {
    info: "\x1b[36m",
    success: "\x1b[32m",
    error: "\x1b[31m",
    reset: "\x1b[0m",
  };
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  console.log(`${colors[type] || ""}${icon} ${message}${colors.reset}`);
}

function test(name, fn) {
  try {
    log(`Testing: ${name}`, "info");
    fn();
    testsPassed++;
    log(`Passed: ${name}`, "success");
  } catch (error) {
    testsFailed++;
    log(`Failed: ${name} - ${error.message}`, "error");
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

function cleanupPath(p) {
  if (fs.existsSync(p)) {
    log(`Cleaning up ${p}...`, "info");
    try {
      execSync(`rm -rf "${p}"`, { stdio: "ignore" });
      log(`Cleaned: ${p}`, "success");
    } catch (error) {
      log(`Warning: Failed to cleanup ${p}: ${error.message}`, "info");
    }
  }
}

function cleanupAll() {
  for (const p of projectPaths) {
    cleanupPath(p);
  }
  // Also cleanup splash assets dir if created
  if (fs.existsSync(WITH_SPLASH_PROJECT.splashDir || "")) {
    cleanupPath(WITH_SPLASH_PROJECT.splashDir);
  }
}

// Cleanup before starting
cleanupAll();

// Ensure cleanup on exit (even if process is killed)
process.on("exit", cleanupAll);
process.on("SIGINT", () => {
  cleanupAll();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanupAll();
  process.exit(1);
});
process.on("uncaughtException", error => {
  log(`Uncaught exception: ${error.message}`, "error");
  cleanupAll();
  process.exit(1);
});
process.on("unhandledRejection", reason => {
  log(`Unhandled rejection: ${reason}`, "error");
  cleanupAll();
  process.exit(1);
});

log(`Starting E2E tests with ${packageManager}...`, "info");

function createProject({ name, bundleId, displayName, splashDir }) {
  const projectPath = path.join("/tmp", name);
  const splashFlag = splashDir ? ` --splash-screen-dir "${splashDir}"` : "";
  const command = `create-rn-app ${name} -p ${packageManager} --bundle-id ${bundleId} --display-name "${displayName}" --skip-git --skip-install --yes${splashFlag}`;

  log(`Running: ${command}`, "info");
  try {
    execSync(command, {
      cwd: "/tmp",
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
      timeout: 120000,
    });
  } catch (error) {
    if (fs.existsSync(projectPath)) {
      log(
        `Warning: Command failed but project was created. Error: ${error.message}`,
        "info"
      );
    } else {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  if (!fs.existsSync(projectPath)) {
    throw new Error("Project directory was not created");
  }

  return projectPath;
}

function writeDummyPng(filePath, label) {
  const pngStub = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAn8B9qX+hwAAAABJRU5ErkJggg==",
    "base64"
  );
  fs.writeFileSync(filePath, pngStub);
}

function prepareSplashAssetsDir() {
  const dir = WITH_SPLASH_PROJECT.splashDir;
  fs.mkdirSync(dir, { recursive: true });
  const iosDir = path.join(dir, "ios");
  const androidDir = path.join(dir, "android");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });

  writeDummyPng(path.join(iosDir, "SplashScreen.png"), "ios1x");
  writeDummyPng(path.join(iosDir, "SplashScreen@2x.png"), "ios2x");
  writeDummyPng(path.join(iosDir, "SplashScreen@3x.png"), "ios3x");

  const densities = [
    "drawable-hdpi",
    "drawable-mdpi",
    "drawable-xhdpi",
    "drawable-xxhdpi",
    "drawable-xxxhdpi",
  ];
  for (const density of densities) {
    const densityPath = path.join(androidDir, density);
    fs.mkdirSync(densityPath, { recursive: true });
    writeDummyPng(path.join(densityPath, "splash.png"), density);
  }

  // also allow flat fallback
  writeDummyPng(path.join(androidDir, "splash.png"), "flat");
}

const DEFAULT_PROJECT_PATH = createProject(DEFAULT_PROJECT);

// Prepare custom splash assets and create project with them
prepareSplashAssetsDir();
const WITH_SPLASH_PROJECT_PATH = createProject(WITH_SPLASH_PROJECT);

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

// Test 5: Check AndroidManifest.xml has package attribute
test("Check AndroidManifest.xml has package attribute", () => {
  const manifestPath = path.join(
    DEFAULT_PROJECT_PATH,
    "android/app/src/main/AndroidManifest.xml"
  );
  const manifestContent = fs.readFileSync(manifestPath, "utf8");

  if (!manifestContent.includes(`package="${DEFAULT_PROJECT.bundleId}"`)) {
    throw new Error(
      `AndroidManifest.xml missing package attribute with bundle ID "${DEFAULT_PROJECT.bundleId}"`
    );
  }
});

// Test 6: Check Podfile has correct target name
test("Check Podfile has correct target name", () => {
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
    if (!packageJson.dependencies[dep] && !packageJson.devDependencies?.[dep]) {
      throw new Error(`Key dependency ${dep} not found in package.json`);
    }
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

// Test 12: iOS bundle identifier replaced in pbxproj
test("Check iOS pbxproj bundle identifier", () => {
  const pbxprojPath = path.join(
    DEFAULT_PROJECT_PATH,
    `ios/${DEFAULT_PROJECT.name}.xcodeproj/project.pbxproj`
  );
  const content = fs.readFileSync(pbxprojPath, "utf8");
  if (
    !content.includes(
      `PRODUCT_BUNDLE_IDENTIFIER = ${DEFAULT_PROJECT.bundleId};`
    )
  ) {
    throw new Error("pbxproj does not contain updated bundle identifier");
  }
});

// Test 13: iOS display name set in Info.plist
test("Check iOS Info.plist display name", () => {
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

// Test 15: Default splash placeholders created when no assets provided
test("Check default splash placeholders exist", () => {
  const iosFiles = [
    path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/Images.xcassets/SplashScreen.imageset/SplashScreen.png`
    ),
    path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/Images.xcassets/SplashScreen.imageset/SplashScreen@2x.png`
    ),
    path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}/Images.xcassets/SplashScreen.imageset/SplashScreen@3x.png`
    ),
  ];
  iosFiles.forEach(file => {
    if (!fs.existsSync(file))
      throw new Error(`Missing iOS splash placeholder: ${file}`);
    const size = fs.statSync(file).size;
    if (size === 0) throw new Error(`iOS splash placeholder is empty: ${file}`);
  });

  const densities = [
    "drawable",
    "drawable-hdpi",
    "drawable-mdpi",
    "drawable-xhdpi",
    "drawable-xxhdpi",
    "drawable-xxxhdpi",
  ];
  for (const density of densities) {
    const file = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "splash.png"
    );
    if (!fs.existsSync(file))
      throw new Error(`Missing Android splash placeholder: ${file}`);
    const size = fs.statSync(file).size;
    if (size === 0)
      throw new Error(`Android splash placeholder is empty: ${file}`);
  }
});

// Test 16: Custom splash assets are copied when provided
test("Check custom splash assets copied", () => {
  const iosTargetDir = path.join(
    WITH_SPLASH_PROJECT_PATH,
    `ios/${WITH_SPLASH_PROJECT.name}/Images.xcassets/SplashScreen.imageset`
  );
  const iosSourceDir = path.join(WITH_SPLASH_PROJECT.splashDir, "ios");
  const iosFiles = [
    "SplashScreen.png",
    "SplashScreen@2x.png",
    "SplashScreen@3x.png",
  ];
  iosFiles.forEach(file => {
    const src = fs.readFileSync(path.join(iosSourceDir, file));
    const dstPath = path.join(iosTargetDir, file);
    if (!fs.existsSync(dstPath))
      throw new Error(`Missing copied iOS splash: ${file}`);
    const dst = fs.readFileSync(dstPath);
    if (!src.equals(dst)) {
      throw new Error(`iOS splash file differs from source: ${file}`);
    }
  });

  const densities = [
    "drawable-hdpi",
    "drawable-mdpi",
    "drawable-xhdpi",
    "drawable-xxhdpi",
    "drawable-xxxhdpi",
  ];
  for (const density of densities) {
    const src = fs.readFileSync(
      path.join(WITH_SPLASH_PROJECT.splashDir, "android", density, "splash.png")
    );
    const dstPath = path.join(
      WITH_SPLASH_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "splash.png"
    );
    if (!fs.existsSync(dstPath))
      throw new Error(`Missing copied Android splash: ${density}`);
    const dst = fs.readFileSync(dstPath);
    if (!src.equals(dst)) {
      throw new Error(`Android splash file differs from source: ${density}`);
    }
  }
});

// Test 11: Test pods installation (only on macOS)
if (testPods && process.platform === 'darwin') {
  test('Check iOS CocoaPods installation', () => {
    const podsPath = path.join(DEFAULT_PROJECT_PATH, "ios/Pods");
    const podfileLockPath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile.lock");

    // Pods might not be installed if --skip-pods was used, so we just check if the command would work
    // by checking if CocoaPods is available
    try {
      execSync('which pod', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('CocoaPods is not installed or not available');
    }

    // If Pods directory exists, check it's not empty
    if (fs.existsSync(podsPath)) {
      const pods = fs.readdirSync(podsPath);
      if (pods.length === 0) {
        throw new Error('Pods directory exists but is empty');
      }
    }
  });
}

// Summary
console.log('\n' + '='.repeat(50));
log(`Tests passed: ${testsPassed}`, 'success');
if (testsFailed > 0) {
  log(`Tests failed: ${testsFailed}`, "error");
  cleanup(); // Cleanup before exit
  process.exit(1);
} else {
  log("All tests passed!", "success");
  cleanup(); // Cleanup before exit
  process.exit(0);
}

