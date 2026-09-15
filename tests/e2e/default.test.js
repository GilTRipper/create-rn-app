const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");
const { generateProject, cleanup, testPodsEnabled } = require("../helpers/generate");
const {
  exists,
  readJson,
  readText,
  readAppDelegate,
  findIosAppDir,
  join,
} = require("../helpers/fs");
const { CHECKS } = require("../helpers/expectations");
const { collectCliGateErrors } = require("../../src/cli-validate");
const fs = require("fs");

describe("default generated app", () => {
  let projectName;
  let projectPath;
  let displayName;
  let bundleIdentifier;

  before(async () => {
    const generated = await generateProject("e2e-default", {
      displayName: "Default E2E",
      bundleIdentifier: "com.test.e2edefault",
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
    displayName = generated.config.displayName;
    bundleIdentifier = generated.config.bundleIdentifier;
  });

  after(() => cleanup(projectPath));

  it("creates the core JS files", () => {
    for (const file of [
      "package.json",
      "app.json",
      "App.tsx",
      "index.js",
      "android/app/src/main/AndroidManifest.xml",
      "ios/Podfile",
      "tsconfig.json",
      "babel.config.js",
      "metro.config.js",
    ]) {
      assert.ok(exists(projectPath, file), `missing ${file}`);
    }
  });

  it("replaces package and display names", () => {
    const pkg = readJson(projectPath, "package.json");
    assert.equal(pkg.name, projectName);
    assert.equal(readJson(projectPath, "app.json").displayName, displayName);
  });

  it("keeps baseline RN versions and skips optional UI kit deps", () => {
    const pkg = readJson(projectPath, "package.json");
    assert.equal(pkg.dependencies.react, "19.2.3");
    assert.equal(pkg.dependencies["react-native"], "0.86.2");
    assert.equal(pkg.engines?.node, ">= 22.11.0");
    assert.ok(pkg.dependencies["@react-navigation/native"]);
    assert.ok((pkg.dependencies["react-native-gesture-handler"] || "").startsWith("^2."));
    assert.ok((pkg.dependencies["react-native-nitro-modules"] || "").includes("0.35."));
    assert.ok(pkg.pnpm?.patchedDependencies?.["react-native-date-picker@5.0.13"]);
    assert.ok(
      !Object.keys(pkg.pnpm?.patchedDependencies || {}).some(key => key.includes("netinfo"))
    );
    assert.equal(pkg.dependencies["react-native-turbo-image"], undefined);
    assert.equal(pkg.dependencies["@callstack/liquid-glass"], undefined);
    assert.equal(pkg.dependencies["react-native-maps"], undefined);
    assert.ok(
      !Object.keys(pkg.dependencies).some(dep => dep.startsWith("@react-native-firebase/"))
    );
  });

  it("copies the date-picker patch and skips UI kit files", () => {
    const patches = fs
      .readdirSync(join(projectPath, "patches"))
      .filter(name => name.endsWith(".patch"));
    assert.ok(patches.includes("react-native-date-picker@5.0.13.patch"));
    assert.ok(!patches.some(name => name.includes("netinfo")));
    for (const file of [
      "src/ui/components/atoms/TurboImage.tsx",
      "src/ui/components/atoms/LiquidGlassView.tsx",
      "src/ui/navigation",
      "src/auth",
      "src/lib/storage.ts",
      "src/lib/analytics",
    ]) {
      assert.equal(exists(projectPath, file), false, `${file} should stay out of the default app`);
    }
  });

  it("keeps worklets as the last Babel plugin", () => {
    const babelConfig = readText(projectPath, "babel.config.js");
    const workletsIndex = babelConfig.lastIndexOf("react-native-worklets/plugin");
    const lastPluginIndex = Math.max(
      babelConfig.lastIndexOf("babel-plugin-root-import"),
      babelConfig.lastIndexOf("@babel/plugin-transform-export-namespace-from")
    );
    assert.ok(workletsIndex > lastPluginIndex);
  });

  it("renames iOS target, module name, and display name", () => {
    const podfile = readText(projectPath, "ios/Podfile");
    assert.ok(podfile.includes(`target '${projectName}'`));
    assert.ok(podfile.includes("platform :ios, min_ios_version_supported"));
    assert.ok(!podfile.includes("$RNFirebaseDisableSPM"));
    assert.ok(!podfile.includes("react-native-maps/Google"));
    assert.ok(!podfile.includes("pod 'FirebaseCore'"));

    assert.ok(exists(projectPath, "ios", projectName, "Info.plist"));
    assert.ok(exists(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj"));
    assert.ok(
      exists(projectPath, "ios", `${projectName}.xcworkspace`, "contents.xcworkspacedata")
    );

    const plist = readText(projectPath, "ios", projectName, "Info.plist");
    assert.ok(plist.includes(`<string>${displayName}</string>`));

    const appDelegate = readAppDelegate(projectPath);
    assert.match(appDelegate, new RegExp(`withModuleName:\\s*"${projectName.toLowerCase()}"`));
    assert.ok(!appDelegate.includes('withModuleName: "helloworld"'));
    assert.ok(!appDelegate.includes("import Firebase"));
    assert.ok(!appDelegate.includes("import GoogleMaps"));
  });

  it("renames Android package and applicationId", () => {
    const javaPath = join(
      projectPath,
      "android/app/src/main/java",
      ...bundleIdentifier.split(".")
    );
    assert.ok(fs.existsSync(join(javaPath, "MainActivity.kt")));
    assert.ok(fs.existsSync(join(javaPath, "MainApplication.kt")));

    const strings = readText(projectPath, "android/app/src/main/res/values/strings.xml");
    assert.ok(strings.includes(`<string name="app_name">${displayName}</string>`));

    const gradle = readText(projectPath, "android/app/build.gradle");
    assert.match(gradle, new RegExp(`applicationId\\s+"${bundleIdentifier}"`));
    assert.match(gradle, new RegExp(`namespace\\s+"${bundleIdentifier}"`));
    assert.ok(!gradle.includes("com.google.gms.google-services"));
    assert.ok(!readText(projectPath, "android/build.gradle").includes("com.google.gms:google-services"));

    const wrapper = readText(projectPath, "android/gradle/wrapper/gradle-wrapper.properties");
    assert.ok(wrapper.includes("gradle-9.3.1-bin.zip"));
  });

  it("does not write a blank android splash next to the template layer-list", () => {
    assert.equal(exists(projectPath, "android/app/src/main/res/drawable/splash.png"), false);
    for (const density of ["hdpi", "mdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      assert.equal(
        exists(projectPath, `android/app/src/main/res/drawable-${density}/splash.png`),
        false,
        `drawable-${density}/splash.png would override the layer-list`
      );
    }
  });

  it("keeps default splash and launcher icons", () => {
    for (const file of [
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset/SplashScreen.png`,
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset/SplashScreen@2x.png`,
      "android/app/src/main/res/drawable/splash.xml",
      "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
    ]) {
      assert.ok(exists(projectPath, file), `missing ${file}`);
      assert.ok(fs.statSync(join(projectPath, file)).size > 0);
    }
  });

  it("does not add environment files or HelloWorld schemes", () => {
    assert.equal(exists(projectPath, ".env.staging"), false);
    const gradle = readText(projectPath, "android/app/build.gradle");
    assert.ok(!gradle.includes("project.ext.envConfigFiles"));

    const schemesDir = join(
      projectPath,
      "ios",
      `${projectName}.xcodeproj`,
      "xcshareddata",
      "xcschemes"
    );
    if (fs.existsSync(schemesDir)) {
      const schemes = fs.readdirSync(schemesDir).filter(file => file.endsWith(".xcscheme"));
      assert.ok(!schemes.some(file => /helloworld/i.test(file)));
      assert.ok(schemes.includes(`${projectName}.xcscheme`));
      const scheme = readText(projectPath, "ios", `${projectName}.xcodeproj`, "xcshareddata", "xcschemes", `${projectName}.xcscheme`);
      assert.ok(!/helloworld/i.test(scheme));
      assert.ok(!schemes.some(file => /Local|Dev|Staging/.test(file)));
    }
  });

  it("skips git when skipGit is set", () => {
    assert.equal(exists(projectPath, ".git"), false);
  });

  it("renames _gitignore and writes ios/.xcode.env.local", () => {
    assert.ok(exists(projectPath, ".gitignore"));
    assert.equal(exists(projectPath, "_gitignore"), false);
    assert.ok(readText(projectPath, ".gitignore").includes("node_modules"));
    assert.ok(exists(projectPath, "SETUP.md"));
    assert.ok(exists(projectPath, "scripts/setup-xcode-env.js"));

    const xcodeEnv = readText(projectPath, "ios/.xcode.env.local");
    assert.ok(xcodeEnv.includes("NODE_BINARY"));
    assert.match(xcodeEnv, /export NODE_BINARY=.+/);
  });

  it("comments Google Maps in the default AndroidManifest", () => {
    const manifest = readText(projectPath, "android/app/src/main/AndroidManifest.xml");
    assert.ok(manifest.includes("<!-- Google Maps API Key -->"));
    assert.ok(manifest.includes("<!-- <meta-data"));
  });

  it("does not leave GoogleService-Info.plist in the Xcode project", () => {
    const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
    assert.ok(!pbxproj.includes("GoogleService-Info.plist"));
  });

  if (testPodsEnabled() && process.platform === "darwin") {
    it("has CocoaPods available when --test-pods is set", () => {
      execSync("which pod", { stdio: "pipe" });
    });
  }
});

// The generator is built for PascalCase names: replace-placeholders.js swaps
// `HelloWorld` for the name as typed and `helloworld` for its lowercase form.
// The CLI gate used to reject capitals outright, which rejected even the
// project name prompt's own default.
describe("PascalCase project name", () => {
  let generated;

  before(async () => {
    generated = await generateProject("E2EPascalApp", {
      displayName: "Pascal E2E",
      bundleIdentifier: "com.test.e2epascal",
    });
  });

  after(() => cleanup(generated.projectPath));

  it("passes the CLI gate that runs before generation", () => {
    assert.deepEqual(
      collectCliGateErrors({
        projectName: generated.projectName,
        bundleIdentifier: generated.config.bundleIdentifier,
      }),
      []
    );
  });

  it("keeps the capitals in the name as typed", () => {
    assert.match(generated.projectName, /[A-Z]/);
  });

  it("lowercases the name everywhere npm and Gradle require it", () => {
    const lowercased = generated.projectName.toLowerCase();

    assert.equal(readJson(generated.projectPath, "package.json").name, lowercased);
    assert.equal(readJson(generated.projectPath, "app.json").name, lowercased);
    assert.match(
      readText(generated.projectPath, "android/settings.gradle"),
      new RegExp(`rootProject\\.name = '${lowercased}'`)
    );
  });

  it("keeps the iOS target and directories in PascalCase", () => {
    assert.equal(findIosAppDir(generated.projectPath), generated.projectName);
    assert.ok(
      exists(generated.projectPath, "ios", `${generated.projectName}.xcodeproj`)
    );
    assert.ok(
      exists(generated.projectPath, "ios", `${generated.projectName}.xcworkspace`)
    );
  });

  for (const [name, check] of CHECKS) {
    it(`holds the ${name} invariants`, () => {
      check(generated);
    });
  }
});
