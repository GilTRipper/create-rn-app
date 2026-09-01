const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  generateProject,
  cleanup,
  prepareSplashDir,
  prepareIconsDir,
} = require("../helpers/generate");
const { exists, readBytes, join } = require("../helpers/fs");

describe("custom splash assets", () => {
  const splashDir = prepareSplashDir();
  let projectName;
  let projectPath;

  before(async () => {
    const generated = await generateProject("e2e-splash", {
      splashScreenDir: splashDir,
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
  });

  after(() => {
    cleanup(projectPath);
    cleanup(splashDir);
  });

  it("copies iOS and Android splash files from the source dir", () => {
    for (const file of ["SplashScreen.png", "SplashScreen@2x.png", "SplashScreen@3x.png"]) {
      const src = fs.readFileSync(path.join(splashDir, "ios", file));
      const dst = readBytes(
        projectPath,
        "ios",
        projectName,
        "Images.xcassets/SplashScreen.imageset",
        file
      );
      assert.ok(src.equals(dst), `iOS splash differs: ${file}`);
    }

    for (const density of [
      "drawable-hdpi",
      "drawable-mdpi",
      "drawable-xhdpi",
      "drawable-xxhdpi",
      "drawable-xxxhdpi",
    ]) {
      const src = fs.readFileSync(path.join(splashDir, "android", density, "splash.png"));
      const dst = readBytes(projectPath, "android/app/src/main/res", density, "splash.png");
      assert.ok(src.equals(dst), `Android splash differs: ${density}`);
    }
  });
});

describe("custom app icons", () => {
  const iconDir = prepareIconsDir();
  let projectName;
  let projectPath;

  before(async () => {
    const generated = await generateProject("e2e-icons", {
      appIconDir: iconDir,
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
  });

  after(() => {
    cleanup(projectPath);
    cleanup(iconDir);
  });

  it("copies Android mipmaps and the iOS app icon set", () => {
    for (const density of [
      "mipmap-hdpi",
      "mipmap-mdpi",
      "mipmap-xhdpi",
      "mipmap-xxhdpi",
      "mipmap-xxxhdpi",
    ]) {
      const src = fs.readFileSync(path.join(iconDir, "android", density, "ic_launcher.png"));
      const dst = readBytes(projectPath, "android/app/src/main/res", density, "ic_launcher.png");
      assert.ok(src.equals(dst), `icon differs: ${density}`);
    }

    const iosSource = path.join(iconDir, "Assets.xcassets", "AppIcon.appiconset");
    const iosTarget = join(
      projectPath,
      "ios",
      projectName,
      "Images.xcassets/AppIcon.appiconset"
    );
    assert.ok(
      fs.readFileSync(path.join(iosSource, "Contents.json")).equals(
        fs.readFileSync(path.join(iosTarget, "Contents.json"))
      )
    );
    for (const icon of ["1024.png", "180.png", "120.png"]) {
      assert.ok(exists(projectPath, "ios", projectName, "Images.xcassets/AppIcon.appiconset", icon));
    }
  });
});
