const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../../src/template");

function packageManager() {
  const args = process.argv;
  const flagIndex = args.indexOf("--package-manager");
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    return args[flagIndex + 1];
  }
  return process.env.CREATE_RN_TEST_PM || "npm";
}

function testPodsEnabled() {
  return (
    process.argv.includes("--test-pods") ||
    process.env.CREATE_RN_TEST_PODS === "1"
  );
}

function uniqueName(base) {
  return `${base}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

function disabledFeatureDefaults() {
  return {
    packageManager: packageManager(),
    skipInstall: true,
    skipGit: true,
    skipPods: true,
    autoYes: false,
    splashScreenDir: null,
    appIconDir: null,
    fontsDir: null,
    envSetupSelectedEnvs: [],
    firebase: { enabled: false, modules: [], googleFiles: { filesByEnv: {} } },
    maps: {
      enabled: false,
      provider: null,
      googleMapsApiKey: null,
      mapboxToken: null,
    },
    zustandStorage: false,
    navigationMode: "none",
    localization: { enabled: false },
    theme: false,
    uiKit: { enabled: false, components: [] },
  };
}

function cleanup(targetPath) {
  if (targetPath && fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

async function generateProject(name, overrides = {}) {
  const projectName = uniqueName(name);
  const projectPath = path.join(os.tmpdir(), projectName);
  cleanup(projectPath);

  const defaults = disabledFeatureDefaults();
  const config = {
    ...defaults,
    ...overrides,
    projectName,
    projectPath,
    bundleIdentifier:
      overrides.bundleIdentifier ||
      `com.test.${projectName.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
    displayName: overrides.displayName || name,
    firebase: {
      ...defaults.firebase,
      ...(overrides.firebase || {}),
      googleFiles: {
        filesByEnv: {},
        ...((overrides.firebase && overrides.firebase.googleFiles) || {}),
      },
    },
    maps: {
      ...defaults.maps,
      ...(overrides.maps || {}),
    },
    localization: {
      ...defaults.localization,
      ...(overrides.localization || {}),
    },
    uiKit: {
      ...defaults.uiKit,
      ...(overrides.uiKit || {}),
    },
  };

  await createApp(config);
  return { projectName, projectPath, config };
}

const PNG_STUB = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAn8B9qX+hwAAAABJRU5ErkJggg==",
  "base64"
);

function writeDummyPng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG_STUB);
}

function writeDummyTtf(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stub = Buffer.alloc(100);
  Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x09, 0x00, 0x40, 0x00, 0x03, 0x00, 0x20]).copy(
    stub
  );
  fs.writeFileSync(filePath, stub);
}

function prepareSplashDir() {
  const dir = path.join(os.tmpdir(), uniqueName("e2e-splash-assets"));
  cleanup(dir);
  const iosDir = path.join(dir, "ios");
  const androidDir = path.join(dir, "android");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });

  writeDummyPng(path.join(iosDir, "SplashScreen.png"));
  writeDummyPng(path.join(iosDir, "SplashScreen@2x.png"));
  writeDummyPng(path.join(iosDir, "SplashScreen@3x.png"));

  for (const density of [
    "drawable-hdpi",
    "drawable-mdpi",
    "drawable-xhdpi",
    "drawable-xxhdpi",
    "drawable-xxxhdpi",
  ]) {
    writeDummyPng(path.join(androidDir, density, "splash.png"));
  }
  writeDummyPng(path.join(androidDir, "splash.png"));
  return dir;
}

function prepareIconsDir() {
  const dir = path.join(os.tmpdir(), uniqueName("e2e-icon-assets"));
  cleanup(dir);

  for (const density of [
    "mipmap-hdpi",
    "mipmap-mdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
  ]) {
    writeDummyPng(path.join(dir, "android", density, "ic_launcher.png"));
    writeDummyPng(path.join(dir, "android", density, "ic_launcher_round.png"));
  }

  const iosAppIconDir = path.join(dir, "Assets.xcassets", "AppIcon.appiconset");
  fs.mkdirSync(iosAppIconDir, { recursive: true });
  for (const icon of ["1024.png", "180.png", "120.png", "87.png", "60.png", "40.png", "29.png"]) {
    writeDummyPng(path.join(iosAppIconDir, icon));
  }
  fs.writeFileSync(
    path.join(iosAppIconDir, "Contents.json"),
    JSON.stringify(
      {
        images: [
          { filename: "1024.png", idiom: "ios-marketing", scale: "1x", size: "1024x1024" },
          { filename: "180.png", idiom: "iphone", scale: "3x", size: "60x60" },
        ],
        info: { author: "xcode", version: 1 },
      },
      null,
      2
    )
  );
  return dir;
}

function prepareFontsDir() {
  const dir = path.join(os.tmpdir(), uniqueName("e2e-fonts-assets"));
  cleanup(dir);
  fs.mkdirSync(dir, { recursive: true });
  writeDummyTtf(path.join(dir, "TestFont-Regular.ttf"));
  writeDummyTtf(path.join(dir, "TestFont-Bold.ttf"));
  writeDummyTtf(path.join(dir, "TestFont-Italic.otf"));
  return dir;
}

function writeDummyFirebaseFiles(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, "GoogleService-Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>BUNDLE_ID</key>
  <string>com.test.app</string>
  <key>GOOGLE_APP_ID</key>
  <string>1:123456789:ios:abcdef</string>
</dict>
</plist>`
  );
  fs.writeFileSync(
    path.join(dirPath, "google-services.json"),
    JSON.stringify({
      project_info: { project_id: "test-project" },
      client: [],
      configuration_version: "1",
    })
  );
}

function firebaseFilesByEnv(baseDir, envs) {
  const filesByEnv = {};
  for (const env of envs) {
    const envDir = path.join(baseDir, env.toLowerCase());
    writeDummyFirebaseFiles(envDir);
    filesByEnv[env] = {
      iosPlist: path.join(envDir, "GoogleService-Info.plist"),
      androidJson: path.join(envDir, "google-services.json"),
    };
  }
  return filesByEnv;
}

module.exports = {
  packageManager,
  testPodsEnabled,
  uniqueName,
  disabledFeatureDefaults,
  cleanup,
  generateProject,
  prepareSplashDir,
  prepareIconsDir,
  prepareFontsDir,
  writeDummyFirebaseFiles,
  firebaseFilesByEnv,
};
