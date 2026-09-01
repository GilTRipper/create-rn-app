const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup, prepareFontsDir } = require("../helpers/generate");
const { exists, readText, readJson } = require("../helpers/fs");

const expectedFonts = [
  "TestFont-Regular.ttf",
  "TestFont-Bold.ttf",
  "TestFont-Italic.otf",
];

describe("custom fonts", () => {
  const fontsDir = prepareFontsDir();
  let projectName;
  let projectPath;

  before(async () => {
    const generated = await generateProject("e2e-fonts", {
      fontsDir,
    });
    projectName = generated.projectName;
    projectPath = generated.projectPath;
  });

  after(() => {
    cleanup(projectPath);
    cleanup(fontsDir);
  });

  it("copies fonts into Android assets and the link manifest", () => {
    for (const font of expectedFonts) {
      assert.ok(exists(projectPath, "android/app/src/main/assets/fonts", font), font);
    }

    const manifest = readJson(projectPath, "android/link-assets-manifest.json");
    const fontEntries = (manifest.data || []).filter(
      entry => entry.path && entry.path.includes("assets/fonts/")
    );
    assert.ok(fontEntries.length > 0);
    for (const entry of fontEntries) {
      assert.ok(entry.sha1, `${entry.path} missing sha1`);
    }
  });

  it("registers fonts in Info.plist, iOS manifest, RN config, and pbxproj", () => {
    const plist = readText(projectPath, "ios", projectName, "Info.plist");
    assert.ok(plist.includes("<key>UIAppFonts</key>"));
    for (const font of expectedFonts) {
      assert.ok(plist.includes(`<string>${font}</string>`), font);
    }

    const iosManifest = readJson(projectPath, "ios/link-assets-manifest.json");
    const fontEntries = (iosManifest.data || []).filter(
      entry => entry.path && entry.path.includes("assets/fonts/")
    );
    assert.ok(fontEntries.length > 0);

    assert.ok(
      readText(projectPath, "react-native.config.js").includes('assets: ["./assets/fonts"]')
    );

    const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
    for (const font of expectedFonts) {
      assert.ok(pbxproj.includes(font), `${font} missing from pbxproj`);
    }
  });
});
