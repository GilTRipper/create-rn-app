const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  shouldHashFile,
  hashProjectFiles,
} = require("../../src/manifest/hash");

function writeFile(root, relative, content) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("manifest/hash - shouldHashFile", () => {
  it("hashes the template files an upgrade would have to merge", () => {
    for (const file of [
      "App.tsx",
      "package.json",
      "index.js",
      "babel.config.js",
      "ios/Podfile",
      "ios/HelloWorld/AppDelegate.swift",
      "ios/HelloWorld.xcodeproj/project.pbxproj",
      "android/app/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "android/app/src/main/res/values/styles.xml",
      "src/navigation/RootNavigator.tsx",
      "patches/react-native-date-picker@5.0.13.patch",
    ]) {
      assert.ok(shouldHashFile(file), `should hash ${file}`);
    }
  });

  it("skips dependency trees, build output and IDE state", () => {
    for (const file of [
      "node_modules/react/index.js",
      ".git/HEAD",
      "ios/Pods/Manifest.lock",
      "android/app/build/outputs/apk/app.apk",
      "android/.gradle/config.properties",
      "android/.idea/workspace.xml",
      "android/app/.cxx/abi.json",
      "ios/HelloWorld.xcodeproj/xcuserdata/someone.xcuserdatad/state",
      "android/app.iml",
      "vendor/bundle/ruby/gem.rb",
    ]) {
      assert.ok(!shouldHashFile(file), `should skip ${file}`);
    }
  });

  it("skips the user's own artwork and binary assets", () => {
    for (const file of [
      "assets/fonts/Inter-Bold.ttf",
      "assets/images/logo.png",
      "ios/HelloWorld/Images.xcassets/AppIcon.appiconset/Contents.json",
      "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
      "android/gradle/wrapper/gradle-wrapper.jar",
    ]) {
      assert.ok(!shouldHashFile(file), `should skip ${file}`);
    }
  });

  // These are gitignored and machine-specific: an Android SDK path and a node
  // binary path that postinstall rewrites. Hashing them makes a freshly cloned
  // project look modified on someone else's machine.
  it("skips machine-specific files the project gitignores", () => {
    assert.ok(!shouldHashFile("android/local.properties"));
    assert.ok(!shouldHashFile("ios/.xcode.env.local"));

    // The committed sibling stays tracked - it is part of the template.
    assert.ok(shouldHashFile("ios/.xcode.env"));
    assert.ok(shouldHashFile("android/gradle.properties"));
  });

  // Firebase config files are the user's credentials, pasted in from the
  // console. Their paths are deliberately kept out of the manifest, so a
  // snapshot can never reproduce them - hashing them would make every
  // comparison claim the template had dropped them.
  it("skips the user's Firebase credentials", () => {
    assert.ok(!shouldHashFile("android/app/src/development/google-services.json"));
    assert.ok(!shouldHashFile("ios/MyApp/GoogleService-Info.plist"));
  });

  it("skips lockfiles, random-id manifests and the manifest itself", () => {
    for (const file of [
      ".create-rn-app.json",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
      "ios/Podfile.lock",
      "Gemfile.lock",
      "ios/link-assets-manifest.json",
      "android/link-assets-manifest.json",
      ".DS_Store",
    ]) {
      assert.ok(!shouldHashFile(file), `should skip ${file}`);
    }
  });

  it("accepts both path separators", () => {
    assert.ok(shouldHashFile("ios\\HelloWorld\\AppDelegate.swift"));
    assert.ok(!shouldHashFile("node_modules\\react\\index.js"));
  });
});

describe("manifest/hash - hashProjectFiles", () => {
  it("hashes the tracked files and nothing else", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-hash-"));
    try {
      writeFile(root, "App.tsx", "export default function App() {}\n");
      writeFile(root, "package.json", '{"name":"x"}\n');
      writeFile(root, "ios/Podfile", "platform :ios\n");
      writeFile(root, "pnpm-lock.yaml", "lockfileVersion: 9\n");
      writeFile(root, "assets/logo.png", "not really a png");
      writeFile(root, "node_modules/react/index.js", "module.exports = {}");
      writeFile(root, ".create-rn-app.json", "{}");

      const hashes = await hashProjectFiles(root);

      assert.deepEqual(Object.keys(hashes), [
        "App.tsx",
        "ios/Podfile",
        "package.json",
      ]);
      // sha1 of the App.tsx content above
      assert.match(hashes["App.tsx"], /^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns sorted keys so manifest rewrites diff cleanly", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-hash-"));
    try {
      writeFile(root, "zebra.ts", "z");
      writeFile(root, "alpha.ts", "a");
      writeFile(root, "ios/Podfile", "p");

      const keys = Object.keys(await hashProjectFiles(root));
      assert.deepEqual(keys, [...keys].sort());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("changes the hash when a file changes and keeps it otherwise", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-hash-"));
    try {
      writeFile(root, "App.tsx", "one");
      writeFile(root, "index.js", "stable");
      const before = await hashProjectFiles(root);

      writeFile(root, "App.tsx", "two");
      const after = await hashProjectFiles(root);

      assert.notEqual(before["App.tsx"], after["App.tsx"]);
      assert.equal(before["index.js"], after["index.js"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
