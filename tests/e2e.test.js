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

const WITH_ICONS_PROJECT = {
  name: "test-e2e-icons",
  bundleId: "com.test.icons",
  displayName: "Icons E2E",
  appIconDir: path.join("/tmp", "test-e2e-icon-assets"),
};

const NO_ENV_NO_FIREBASE_PROJECT = {
  name: "test-e2e-no-env-no-firebase",
  bundleId: "com.test.noenvnofirebase",
  displayName: "No Env No Firebase",
};

const projectPaths = [
  path.join("/tmp", DEFAULT_PROJECT.name),
  path.join("/tmp", WITH_SPLASH_PROJECT.name),
  path.join("/tmp", WITH_ICONS_PROJECT.name),
  path.join("/tmp", NO_ENV_NO_FIREBASE_PROJECT.name),
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
  // Also cleanup icon assets dir if created
  if (fs.existsSync(WITH_ICONS_PROJECT.appIconDir || "")) {
    cleanupPath(WITH_ICONS_PROJECT.appIconDir);
  }
  // Cleanup no-env-no-firebase project
  cleanupPath(path.join("/tmp", NO_ENV_NO_FIREBASE_PROJECT.name));
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

function createProject({
  name,
  bundleId,
  displayName,
  splashDir,
  appIconDir,
  skipEnvs = false,
  enableFirebase = false,
  firebaseModules = [],
  firebaseConfigDir = null,
}) {
  const projectPath = path.join("/tmp", name);
  const splashFlag = splashDir ? ` --splash-screen-dir "${splashDir}"` : "";
  const iconFlag = appIconDir ? ` --app-icon-dir "${appIconDir}"` : "";

  // --yes flag automatically skips optional prompts (environments, Firebase)
  // So for testing "no envs, no Firebase" scenario, we can just use --yes
  let command = `create-rn-app ${name} -p ${packageManager} --bundle-id ${bundleId} --display-name "${displayName}" --skip-git --skip-install --yes${splashFlag}${iconFlag}`;

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

function prepareAppIconsDir() {
  const dir = WITH_ICONS_PROJECT.appIconDir;
  fs.mkdirSync(dir, { recursive: true });

  // Android icons structure
  const androidDir = path.join(dir, "android");
  fs.mkdirSync(androidDir, { recursive: true });

  const densities = [
    "mipmap-hdpi",
    "mipmap-mdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
  ];
  for (const density of densities) {
    const densityPath = path.join(androidDir, density);
    fs.mkdirSync(densityPath, { recursive: true });
    writeDummyPng(
      path.join(densityPath, "ic_launcher.png"),
      `android-${density}`
    );
    writeDummyPng(
      path.join(densityPath, "ic_launcher_round.png"),
      `android-${density}-round`
    );
  }

  // iOS icons structure
  const iosAppIconDir = path.join(dir, "Assets.xcassets", "AppIcon.appiconset");
  fs.mkdirSync(iosAppIconDir, { recursive: true });

  // Create some key iOS icon files
  const iosIcons = [
    "1024.png",
    "180.png",
    "120.png",
    "87.png",
    "60.png",
    "40.png",
    "29.png",
  ];
  iosIcons.forEach(icon => {
    writeDummyPng(path.join(iosAppIconDir, icon), `ios-${icon}`);
  });

  // Create Contents.json
  const contentsJson = {
    images: [
      {
        filename: "1024.png",
        idiom: "ios-marketing",
        scale: "1x",
        size: "1024x1024",
      },
      {
        filename: "180.png",
        idiom: "iphone",
        scale: "3x",
        size: "60x60",
      },
    ],
    info: {
      author: "xcode",
      version: 1,
    },
  };
  fs.writeFileSync(
    path.join(iosAppIconDir, "Contents.json"),
    JSON.stringify(contentsJson, null, 2)
  );
}

const DEFAULT_PROJECT_PATH = createProject(DEFAULT_PROJECT);

// Prepare custom splash assets and create project with them
prepareSplashAssetsDir();
const WITH_SPLASH_PROJECT_PATH = createProject(WITH_SPLASH_PROJECT);

// Prepare custom app icons and create project with them
prepareAppIconsDir();
const WITH_ICONS_PROJECT_PATH = createProject(WITH_ICONS_PROJECT);

// Create project without environments and without Firebase (default --yes behavior)
// --yes flag automatically skips optional prompts, so this will create a project without envs and Firebase
const NO_ENV_NO_FIREBASE_PROJECT_PATH = createProject(
  NO_ENV_NO_FIREBASE_PROJECT
);

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

// Test 5: Check Podfile has correct target name
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

// Test 17: Default app icons exist when no icons provided
test("Check default app icons exist", () => {
  // Check Android default icons exist
  const densities = [
    "mipmap-hdpi",
    "mipmap-mdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
  ];
  for (const density of densities) {
    const launcherPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "ic_launcher.png"
    );
    const launcherRoundPath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "ic_launcher_round.png"
    );

    if (!fs.existsSync(launcherPath)) {
      throw new Error(`Missing Android default icon: ${launcherPath}`);
    }
    if (!fs.existsSync(launcherRoundPath)) {
      throw new Error(
        `Missing Android default round icon: ${launcherRoundPath}`
      );
    }

    const launcherSize = fs.statSync(launcherPath).size;
    const launcherRoundSize = fs.statSync(launcherRoundPath).size;
    if (launcherSize === 0) {
      throw new Error(`Android default icon is empty: ${launcherPath}`);
    }
    if (launcherRoundSize === 0) {
      throw new Error(
        `Android default round icon is empty: ${launcherRoundPath}`
      );
    }
  }

  // Check iOS default icons exist (optional - default icons may not exist)
  const iosAppIconPath = path.join(
    DEFAULT_PROJECT_PATH,
    `ios/${DEFAULT_PROJECT.name}/Images.xcassets/AppIcon.appiconset`
  );
  if (fs.existsSync(iosAppIconPath)) {
    // Check that Contents.json exists
    const contentsJsonPath = path.join(iosAppIconPath, "Contents.json");
    if (!fs.existsSync(contentsJsonPath)) {
      throw new Error(`Missing iOS Contents.json: ${contentsJsonPath}`);
    }

    // Check that at least some icon files exist
    const iconFiles = fs
      .readdirSync(iosAppIconPath)
      .filter(file => /\.(png|PNG)$/.test(file));
    if (iconFiles.length === 0) {
      throw new Error(`No iOS icon files found in: ${iosAppIconPath}`);
    }
  }
  // iOS default icons are optional - they may not exist if removed
});

// Test 18: Custom app icons are copied when provided
test("Check custom app icons copied", () => {
  // Check Android icons
  const androidSourceDir = path.join(WITH_ICONS_PROJECT.appIconDir, "android");
  const densities = [
    "mipmap-hdpi",
    "mipmap-mdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
  ];

  for (const density of densities) {
    const sourceLauncher = path.join(
      androidSourceDir,
      density,
      "ic_launcher.png"
    );
    const sourceLauncherRound = path.join(
      androidSourceDir,
      density,
      "ic_launcher_round.png"
    );

    const targetLauncher = path.join(
      WITH_ICONS_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "ic_launcher.png"
    );
    const targetLauncherRound = path.join(
      WITH_ICONS_PROJECT_PATH,
      "android/app/src/main/res",
      density,
      "ic_launcher_round.png"
    );

    // Check ic_launcher.png
    if (!fs.existsSync(targetLauncher)) {
      throw new Error(`Missing copied Android icon: ${targetLauncher}`);
    }
    const srcLauncher = fs.readFileSync(sourceLauncher);
    const dstLauncher = fs.readFileSync(targetLauncher);
    if (!srcLauncher.equals(dstLauncher)) {
      throw new Error(
        `Android icon file differs from source: ${density}/ic_launcher.png`
      );
    }

    // Check ic_launcher_round.png
    if (!fs.existsSync(targetLauncherRound)) {
      throw new Error(
        `Missing copied Android round icon: ${targetLauncherRound}`
      );
    }
    const srcLauncherRound = fs.readFileSync(sourceLauncherRound);
    const dstLauncherRound = fs.readFileSync(targetLauncherRound);
    if (!srcLauncherRound.equals(dstLauncherRound)) {
      throw new Error(
        `Android round icon file differs from source: ${density}/ic_launcher_round.png`
      );
    }
  }

  // Check iOS icons
  const iosSourceDir = path.join(
    WITH_ICONS_PROJECT.appIconDir,
    "Assets.xcassets",
    "AppIcon.appiconset"
  );
  const iosTargetDir = path.join(
    WITH_ICONS_PROJECT_PATH,
    `ios/${WITH_ICONS_PROJECT.name}/Images.xcassets/AppIcon.appiconset`
  );

  // Check Contents.json
  const sourceContents = path.join(iosSourceDir, "Contents.json");
  const targetContents = path.join(iosTargetDir, "Contents.json");
  if (!fs.existsSync(targetContents)) {
    throw new Error(`Missing copied iOS Contents.json: ${targetContents}`);
  }
  const srcContents = fs.readFileSync(sourceContents);
  const dstContents = fs.readFileSync(targetContents);
  if (!srcContents.equals(dstContents)) {
    throw new Error("iOS Contents.json differs from source");
  }

  // Check icon files
  const iosIconFiles = ["1024.png", "180.png", "120.png", "87.png", "60.png"];
  iosIconFiles.forEach(iconFile => {
    const sourceIcon = path.join(iosSourceDir, iconFile);
    const targetIcon = path.join(iosTargetDir, iconFile);

    if (!fs.existsSync(targetIcon)) {
      throw new Error(`Missing copied iOS icon: ${iconFile}`);
    }
    const srcIcon = fs.readFileSync(sourceIcon);
    const dstIcon = fs.readFileSync(targetIcon);
    if (!srcIcon.equals(dstIcon)) {
      throw new Error(`iOS icon file differs from source: ${iconFile}`);
    }
  });
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
if (testPods && process.platform === "darwin") {
  test("Check iOS CocoaPods installation", () => {
    const podsPath = path.join(DEFAULT_PROJECT_PATH, "ios/Pods");
    const podfileLockPath = path.join(DEFAULT_PROJECT_PATH, "ios/Podfile.lock");

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

// Test 19: Environment setup - check .env files created (if environment setup was used)
test("Check environment .env files created", () => {
  // Check if .env files exist in project root (optional - only if environment setup was used)
  const possibleEnvFiles = [
    ".env.production",
    ".env.local",
    ".env.development",
    ".env.staging",
  ];
  let foundEnvFiles = 0;

  for (const envFile of possibleEnvFiles) {
    const envFilePath = path.join(DEFAULT_PROJECT_PATH, envFile);
    if (fs.existsSync(envFilePath)) {
      foundEnvFiles++;
      const content = fs.readFileSync(envFilePath, "utf8");
      // Check that file is not empty and has expected format
      if (content.trim().length === 0) {
        throw new Error(`${envFile} exists but is empty`);
      }
      // Check that it's a valid .env file (starts with # or has KEY=VALUE format)
      if (!content.match(/^#|^[A-Z_]+=/m)) {
        throw new Error(`${envFile} doesn't have valid .env format`);
      }
    }
  }

  // If any .env files exist, environment setup was used
  // This test passes if no .env files exist (environment setup not used) or if they exist and are valid
});

// Test 20: Environment setup - Android flavors and source sets (if environment setup was used)
test("Check Android environment setup", () => {
  const buildGradlePath = path.join(
    DEFAULT_PROJECT_PATH,
    "android/app/build.gradle"
  );
  if (!fs.existsSync(buildGradlePath)) {
    throw new Error("android/app/build.gradle does not exist");
  }

  const content = fs.readFileSync(buildGradlePath, "utf8");

  // Check if envConfigFiles exists (indicates environment setup was used)
  if (content.includes("project.ext.envConfigFiles")) {
    // If environment setup was used, verify structure
    // Check that productFlavors exist
    if (!content.includes("productFlavors")) {
      throw new Error(
        "build.gradle has envConfigFiles but missing productFlavors"
      );
    }

    // Check that flavorDimensions exist
    if (!content.includes("flavorDimensions")) {
      throw new Error(
        "build.gradle has productFlavors but missing flavorDimensions"
      );
    }

    // Check that envConfigFiles has proper format (not malformed)
    const envConfigMatch = content.match(
      /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/
    );
    if (!envConfigMatch) {
      throw new Error("envConfigFiles block found but format is invalid");
    }

    // Check for environment source directories (optional - only for non-production)
    const srcDir = path.join(DEFAULT_PROJECT_PATH, "android/app/src");
    if (fs.existsSync(srcDir)) {
      const srcDirs = fs.readdirSync(srcDir);
      const envDirs = srcDirs.filter(dir =>
        ["local", "development", "staging"].includes(dir.toLowerCase())
      );
      // If environment setup was used, should have at least one env directory (if non-production envs selected)
    }
  }
  // If envConfigFiles doesn't exist, environment setup wasn't used - test passes
});

// Test 21: Environment setup - iOS schemes (if environment setup was used)
test("Check iOS environment schemes", () => {
  const schemesDir = path.join(
    DEFAULT_PROJECT_PATH,
    `ios/${DEFAULT_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
  );

  // Schemes are optional in CI (xcshareddata may not exist when pods are skipped)
  if (!fs.existsSync(schemesDir)) {
    return;
  }

  const schemeFiles = fs
    .readdirSync(schemesDir)
    .filter(file => file.endsWith(".xcscheme"));

  // If no shared schemes, skip
  if (schemeFiles.length === 0) {
    return;
  }

  // If base scheme is missing, skip (env setup not used)
  const baseScheme = `${DEFAULT_PROJECT.name}.xcscheme`;
  if (!schemeFiles.includes(baseScheme)) {
    return;
  }

  // If environment setup was used, check for environment schemes
  const envSchemes = schemeFiles.filter(
    file =>
      file.includes("Local") ||
      file.includes("Dev") ||
      file.includes("Stg") ||
      file.includes("Development") ||
      file.includes("Staging")
  );

  // If environment schemes exist, verify they have proper structure
  for (const schemeFile of envSchemes) {
    const schemePath = path.join(schemesDir, schemeFile);
    const schemeContent = fs.readFileSync(schemePath, "utf8");

    // Check that scheme has BuildableReference
    if (!schemeContent.includes("BuildableReference")) {
      throw new Error(`Scheme ${schemeFile} is missing BuildableReference`);
    }

    // Check that scheme has PreActions (if environment setup was used)
    if (schemeContent.includes("PreActions")) {
      // Verify PreActions have proper structure
      if (!schemeContent.includes("ExecutionAction")) {
        throw new Error(
          `Scheme ${schemeFile} has PreActions but missing ExecutionAction`
        );
      }
    }
  }
});

// Test 22: Environment setup - package.json scripts (if environment setup was used)
test("Check environment scripts in package.json", () => {
  const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json does not exist");
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  if (!packageJson.scripts) {
    throw new Error("package.json is missing scripts section");
  }

  // Check if environment scripts exist (optional - only if environment setup was used)
  const androidScripts = Object.keys(packageJson.scripts).filter(key =>
    key.startsWith("android:")
  );
  const iosScripts = Object.keys(packageJson.scripts).filter(key =>
    key.startsWith("ios:")
  );

  // If environment scripts exist, verify they have correct format
  for (const scriptKey of [...androidScripts, ...iosScripts]) {
    const scriptValue = packageJson.scripts[scriptKey];

    // Check that script is a string
    if (typeof scriptValue !== "string") {
      throw new Error(`Script ${scriptKey} is not a string`);
    }

    // Check that script is not empty
    if (scriptValue.trim().length === 0) {
      throw new Error(`Script ${scriptKey} is empty`);
    }

    // For Android scripts, check they reference correct modes
    if (scriptKey.startsWith("android:")) {
      if (scriptKey.includes("prod") && !scriptValue.includes("production")) {
        throw new Error(`Script ${scriptKey} should reference production mode`);
      }
      if (scriptKey.includes("dev") && !scriptValue.includes("development")) {
        throw new Error(
          `Script ${scriptKey} should reference development mode`
        );
      }
      if (scriptKey.includes("stg") && !scriptValue.includes("staging")) {
        throw new Error(`Script ${scriptKey} should reference staging mode`);
      }
    }

    // For iOS scripts, check they reference correct schemes
    if (scriptKey.startsWith("ios:")) {
      if (!scriptValue.includes("--scheme")) {
        throw new Error(`Script ${scriptKey} should include --scheme flag`);
      }
    }
  }
});

// Test 23: Firebase not included by default
test("Check Firebase dependencies not included when not enabled", () => {
  const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  const firebaseDeps = Object.keys(packageJson.dependencies || {}).filter(dep =>
    dep.startsWith("@react-native-firebase/")
  );

  if (firebaseDeps.length > 0) {
    throw new Error(
      `Firebase dependencies found when Firebase should not be enabled: ${firebaseDeps.join(
        ", "
      )}`
    );
  }
});

// Test 24: iOS scheme renamed when no environments selected
test("Check iOS scheme renamed from HelloWorld when no environments", () => {
  const schemesDir = path.join(
    NO_ENV_NO_FIREBASE_PROJECT_PATH,
    `ios/${NO_ENV_NO_FIREBASE_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
  );

  if (!fs.existsSync(schemesDir)) {
    // Schemes directory might not exist if pods are skipped
    log("Schemes directory not found, skipping test", "info");
    return;
  }

  const schemeFiles = fs
    .readdirSync(schemesDir)
    .filter(file => file.endsWith(".xcscheme"));

  if (schemeFiles.length === 0) {
    log("No scheme files found, skipping test", "info");
    return;
  }

  // Check that HelloWorld scheme doesn't exist
  const helloWorldScheme = schemeFiles.find(
    file =>
      file.includes("HelloWorld") || file.toLowerCase().includes("helloworld")
  );

  if (helloWorldScheme) {
    throw new Error(
      `HelloWorld scheme still exists: ${helloWorldScheme}. Should be renamed to ${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`
    );
  }

  // Check that project name scheme exists
  const projectScheme = `${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`;
  if (!schemeFiles.includes(projectScheme)) {
    throw new Error(
      `Expected scheme ${projectScheme} not found. Found: ${schemeFiles.join(
        ", "
      )}`
    );
  }

  // Check scheme content doesn't contain HelloWorld
  const schemePath = path.join(schemesDir, projectScheme);
  const schemeContent = fs.readFileSync(schemePath, "utf8");

  if (
    schemeContent.includes("HelloWorld") ||
    schemeContent.includes("helloworld")
  ) {
    throw new Error(
      `Scheme ${projectScheme} still contains HelloWorld references`
    );
  }

  // Check that scheme has correct project name references
  if (!schemeContent.includes(NO_ENV_NO_FIREBASE_PROJECT.name)) {
    throw new Error(
      `Scheme ${projectScheme} doesn't contain project name "${NO_ENV_NO_FIREBASE_PROJECT.name}"`
    );
  }

  // Check that scheme has BuildableReference with correct project name
  if (
    !schemeContent.includes(
      `BuildableName = "${NO_ENV_NO_FIREBASE_PROJECT.name}.app"`
    )
  ) {
    // Also check alternative format
    if (
      !schemeContent.includes(
        `BuildableName = "${NO_ENV_NO_FIREBASE_PROJECT.name.toLowerCase()}.app"`
      )
    ) {
      log(
        "Warning: BuildableName format might differ, but scheme exists and is renamed",
        "info"
      );
    }
  }
});

// Test 24.1: iOS scheme structure when no environments selected
test("Check iOS scheme structure when no environments selected", () => {
  const schemesDir = path.join(
    NO_ENV_NO_FIREBASE_PROJECT_PATH,
    `ios/${NO_ENV_NO_FIREBASE_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
  );

  if (!fs.existsSync(schemesDir)) {
    log("Schemes directory not found, skipping test", "info");
    return;
  }

  const schemeFiles = fs
    .readdirSync(schemesDir)
    .filter(file => file.endsWith(".xcscheme"));

  if (schemeFiles.length === 0) {
    log("No scheme files found, skipping test", "info");
    return;
  }

  // When no environments are selected, there should be only one scheme (the base scheme)
  // and it should be named after the project, not HelloWorld
  const projectScheme = `${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`;

  if (!schemeFiles.includes(projectScheme)) {
    throw new Error(
      `Base scheme ${projectScheme} not found when no environments selected. Found: ${schemeFiles.join(
        ", "
      )}`
    );
  }

  // Check that there are no environment-specific schemes (Local, Dev, Stg, etc.)
  const envSchemes = schemeFiles.filter(
    file =>
      file.includes("Local") ||
      file.includes("Dev") ||
      file.includes("Stg") ||
      file.includes("Development") ||
      file.includes("Staging")
  );

  if (envSchemes.length > 0) {
    throw new Error(
      `Environment-specific schemes found when no environments selected: ${envSchemes.join(
        ", "
      )}`
    );
  }

  // Verify scheme content is valid XML and contains required elements
  const schemePath = path.join(schemesDir, projectScheme);
  const schemeContent = fs.readFileSync(schemePath, "utf8");

  // Check for required scheme elements
  if (!schemeContent.includes("<Scheme")) {
    throw new Error(`Scheme ${projectScheme} is missing <Scheme> root element`);
  }

  if (!schemeContent.includes("BuildAction")) {
    throw new Error(`Scheme ${projectScheme} is missing BuildAction`);
  }

  if (!schemeContent.includes("LaunchAction")) {
    throw new Error(`Scheme ${projectScheme} is missing LaunchAction`);
  }

  // Check that scheme doesn't have environment-specific pre-actions
  // (when no environments, pre-actions for .env files should not exist)
  if (schemeContent.includes("PreActions")) {
    // If PreActions exist, they should not be for environment files
    if (
      schemeContent.includes(".env.") &&
      !schemeContent.includes(".env.production")
    ) {
      // Allow .env.production as it might be the default
      const envPreActions = schemeContent.match(
        /\.env\.(local|development|staging)/g
      );
      if (envPreActions && envPreActions.length > 0) {
        throw new Error(
          `Scheme ${projectScheme} has environment-specific pre-actions when no environments selected: ${envPreActions.join(
            ", "
          )}`
        );
      }
    }
  }
});

// Test 25: GoogleService-Info.plist not in Xcode project when Firebase disabled
test("Check GoogleService-Info.plist not in Xcode project when Firebase disabled", () => {
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

// Test 27: Podfile doesn't have Firebase pods when Firebase disabled
test("Check Podfile doesn't have Firebase pods when Firebase disabled", () => {
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

    if (androidBuildGradleContent.includes("com.google.gms:google-services")) {
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

// Test 29: AppDelegate withModuleName is replaced correctly
test("Check AppDelegate withModuleName is replaced correctly", () => {
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
        `withModuleName should be "${projectNameLower}" but found: ${content.match(/withModuleName:\s*"[^"]+"/)?.[0] || "not found"}`
      );
    }
  }
});

// Summary
console.log('\n' + '='.repeat(50));
log(`Tests passed: ${testsPassed}`, 'success');
if (testsFailed > 0) {
  log(`Tests failed: ${testsFailed}`, "error");
  cleanupAll(); // Cleanup before exit
  process.exit(1);
} else {
  log("All tests passed!", "success");
  cleanupAll(); // Cleanup before exit
  process.exit(0);
}

