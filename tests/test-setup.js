const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { log, cleanupPath } = require("./test-helpers");

// Parse command line arguments
const args = process.argv.slice(2);
const packageManager = args.includes("--package-manager")
  ? args[args.indexOf("--package-manager") + 1] || "npm"
  : "npm";
const testPods = args.includes("--test-pods");

// Project configurations
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

const WITH_FONTS_PROJECT = {
  name: "test-e2e-fonts",
  bundleId: "com.test.fonts",
  displayName: "Fonts E2E",
  fontsDir: path.join("/tmp", "test-e2e-fonts-assets"),
};

const projectPaths = [
  path.join("/tmp", DEFAULT_PROJECT.name),
  path.join("/tmp", WITH_SPLASH_PROJECT.name),
  path.join("/tmp", WITH_ICONS_PROJECT.name),
  path.join("/tmp", NO_ENV_NO_FIREBASE_PROJECT.name),
  path.join("/tmp", WITH_FONTS_PROJECT.name),
];

function createProject({
  name,
  bundleId,
  displayName,
  splashDir,
  appIconDir,
  fontsDir,
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

  // Note: fontsDir is passed via interactive prompt, not CLI flag
  // We'll handle font testing by creating project and manually testing font structure

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

function writeDummyTtf(filePath, fontName) {
  // Create a minimal valid TTF file header
  const ttfHeader = Buffer.from([
    0x00,
    0x01,
    0x00,
    0x00, // version 1.0
    0x00,
    0x09, // numTables (9 common tables)
    0x00,
    0x40, // searchRange
    0x00,
    0x03, // entrySelector
    0x00,
    0x20, // rangeShift
  ]);

  // For testing, we'll create a minimal file - just enough bytes to be valid
  // In reality, a full TTF needs more, but for our tests (copying and linking),
  // this stub is sufficient
  const stub = Buffer.alloc(100); // 100 bytes stub
  ttfHeader.copy(stub, 0);
  fs.writeFileSync(filePath, stub);
}

function prepareFontsDir() {
  const dir = WITH_FONTS_PROJECT.fontsDir;
  fs.mkdirSync(dir, { recursive: true });

  // Create test font files
  writeDummyTtf(path.join(dir, "TestFont-Regular.ttf"), "TestFont Regular");
  writeDummyTtf(path.join(dir, "TestFont-Bold.ttf"), "TestFont Bold");
  writeDummyTtf(path.join(dir, "TestFont-Italic.otf"), "TestFont Italic");
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
  // Also cleanup fonts assets dir if created
  if (fs.existsSync(WITH_FONTS_PROJECT.fontsDir || "")) {
    cleanupPath(WITH_FONTS_PROJECT.fontsDir);
  }
  // Cleanup no-env-no-firebase project
  cleanupPath(path.join("/tmp", NO_ENV_NO_FIREBASE_PROJECT.name));
}

// Create projects (will be called from main e2e.test.js)
let DEFAULT_PROJECT_PATH = null;
let WITH_SPLASH_PROJECT_PATH = null;
let WITH_ICONS_PROJECT_PATH = null;
let NO_ENV_NO_FIREBASE_PROJECT_PATH = null;
let WITH_FONTS_PROJECT_PATH = null;

function initializeProjects() {
  DEFAULT_PROJECT_PATH = createProject(DEFAULT_PROJECT);

  prepareSplashAssetsDir();
  WITH_SPLASH_PROJECT_PATH = createProject(WITH_SPLASH_PROJECT);

  prepareAppIconsDir();
  WITH_ICONS_PROJECT_PATH = createProject(WITH_ICONS_PROJECT);

  prepareFontsDir();
  WITH_FONTS_PROJECT_PATH = createProject({
    name: WITH_FONTS_PROJECT.name,
    bundleId: WITH_FONTS_PROJECT.bundleId,
    displayName: WITH_FONTS_PROJECT.displayName,
  });

  NO_ENV_NO_FIREBASE_PROJECT_PATH = createProject(NO_ENV_NO_FIREBASE_PROJECT);
}

module.exports = {
  packageManager,
  testPods,
  DEFAULT_PROJECT,
  WITH_SPLASH_PROJECT,
  WITH_ICONS_PROJECT,
  NO_ENV_NO_FIREBASE_PROJECT,
  WITH_FONTS_PROJECT,
  projectPaths,
  createProject,
  prepareSplashAssetsDir,
  prepareAppIconsDir,
  prepareFontsDir,
  cleanupAll,
  initializeProjects,
  get DEFAULT_PROJECT_PATH() {
    return DEFAULT_PROJECT_PATH;
  },
  get WITH_SPLASH_PROJECT_PATH() {
    return WITH_SPLASH_PROJECT_PATH;
  },
  get WITH_ICONS_PROJECT_PATH() {
    return WITH_ICONS_PROJECT_PATH;
  },
  get NO_ENV_NO_FIREBASE_PROJECT_PATH() {
    return NO_ENV_NO_FIREBASE_PROJECT_PATH;
  },
  get WITH_FONTS_PROJECT_PATH() {
    return WITH_FONTS_PROJECT_PATH;
  },
};
