const fs = require("fs");
const path = require("path");
const { test } = require("./test-helpers");
const {
  DEFAULT_PROJECT,
  DEFAULT_PROJECT_PATH,
  WITH_SPLASH_PROJECT,
  WITH_SPLASH_PROJECT_PATH,
  WITH_ICONS_PROJECT,
  WITH_ICONS_PROJECT_PATH,
} = require("./test-setup");

module.exports = function runAssetsTests() {
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
      if (size === 0)
        throw new Error(`iOS splash placeholder is empty: ${file}`);
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
        path.join(
          WITH_SPLASH_PROJECT.splashDir,
          "android",
          density,
          "splash.png"
        )
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
    const androidSourceDir = path.join(
      WITH_ICONS_PROJECT.appIconDir,
      "android"
    );
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
};
