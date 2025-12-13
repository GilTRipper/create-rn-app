const fs = require("fs");
const path = require("path");
const { test, log } = require("./test-helpers");
const { WITH_FONTS_PROJECT, WITH_FONTS_PROJECT_PATH } = require("./test-setup");

module.exports = function runFontsTests() {
  // Test 30: Fonts - Android fonts copied to main/assets/fonts
  test("Check Android fonts copied to main/assets/fonts when fonts provided", () => {
    // Check if fonts project was created
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;

    const androidFontsDir = path.join(
      fontsProjectPath,
      "android/app/src/main/assets/fonts"
    );

    // If fonts directory exists, check that fonts are there
    if (fs.existsSync(androidFontsDir)) {
      const fontFiles = fs.readdirSync(androidFontsDir);
      const ttfFiles = fontFiles.filter(file => /\.(ttf|otf)$/i.test(file));

      if (ttfFiles.length === 0) {
        throw new Error(
          "Android fonts directory exists but contains no font files"
        );
      }

      // Check that expected fonts are present
      const expectedFonts = [
        "TestFont-Regular.ttf",
        "TestFont-Bold.ttf",
        "TestFont-Italic.otf",
      ];
      const foundFonts = expectedFonts.filter(font =>
        fontFiles.some(file => file === font)
      );

      if (foundFonts.length !== expectedFonts.length) {
        throw new Error(
          `Expected ${expectedFonts.length} fonts, found ${
            foundFonts.length
          }. Found: ${foundFonts.join(", ")}`
        );
      }
    }
  });

  // Test 31: Fonts - Android link-assets-manifest.json contains fonts
  test("Check Android link-assets-manifest.json contains fonts when fonts provided", () => {
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;

    const manifestPath = path.join(
      fontsProjectPath,
      "android/link-assets-manifest.json"
    );

    if (!fs.existsSync(manifestPath)) {
      throw new Error("Android link-assets-manifest.json not found");
    }

    const manifestContent = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    if (!manifest.data || manifest.data.length === 0) {
      // If no fonts provided, manifest should be empty - this is OK
      log("No fonts in manifest (fonts not provided), skipping", "info");
      return;
    }

    // Check that fonts are in the manifest
    const fontEntries = manifest.data.filter(
      entry => entry.path && entry.path.includes("assets/fonts/")
    );

    if (fontEntries.length === 0) {
      throw new Error(
        "No font entries found in Android link-assets-manifest.json"
      );
    }

    // Check that each font entry has path and sha1
    for (const entry of fontEntries) {
      if (!entry.path) {
        throw new Error("Font entry in manifest missing path");
      }
      if (!entry.sha1) {
        throw new Error(`Font entry ${entry.path} missing sha1 hash`);
      }
    }
  });

  // Test 32: Fonts - iOS Info.plist contains UIAppFonts when fonts provided
  test("Check iOS Info.plist contains UIAppFonts when fonts provided", () => {
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;

    const infoPlistPath = path.join(
      fontsProjectPath,
      `ios/${WITH_FONTS_PROJECT.name}/Info.plist`
    );

    if (!fs.existsSync(infoPlistPath)) {
      throw new Error("iOS Info.plist not found");
    }

    const plistContent = fs.readFileSync(infoPlistPath, "utf8");

    // Check if UIAppFonts key exists
    if (!plistContent.includes("<key>UIAppFonts</key>")) {
      // If fonts are not provided, UIAppFonts might not exist - this is OK
      // But if fonts directory exists and fonts were copied, UIAppFonts should exist
      const assetsFontsDir = path.join(fontsProjectPath, "assets/fonts");
      if (fs.existsSync(assetsFontsDir)) {
        const fontFiles = fs
          .readdirSync(assetsFontsDir)
          .filter(file => /\.(ttf|otf|ttc|woff|woff2)$/i.test(file));
        if (fontFiles.length > 0) {
          throw new Error(
            "Fonts exist in assets/fonts but UIAppFonts not found in Info.plist"
          );
        }
      }
      // No fonts, so UIAppFonts not required
      return;
    }

    // If UIAppFonts exists, check that it has font entries
    const uiAppFontsMatch = plistContent.match(
      /<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/
    );

    if (!uiAppFontsMatch) {
      throw new Error("UIAppFonts key exists but array is malformed");
    }

    const arrayContent = uiAppFontsMatch[1];
    const fontEntries = arrayContent.match(/<string>([^<]+)<\/string>/g);

    if (!fontEntries || fontEntries.length === 0) {
      throw new Error("UIAppFonts array exists but contains no font entries");
    }

    // Check that expected fonts are in the array
    const fontNames = fontEntries.map(entry =>
      entry.replace(/<string>|<\/string>/g, "").trim()
    );
    const expectedFonts = [
      "TestFont-Regular.ttf",
      "TestFont-Bold.ttf",
      "TestFont-Italic.otf",
    ];
    const foundFonts = expectedFonts.filter(font =>
      fontNames.some(name => name === font)
    );

    // If fonts were provided, they should be in the array
    const assetsFontsDir = path.join(fontsProjectPath, "assets/fonts");
    if (fs.existsSync(assetsFontsDir)) {
      const fontFiles = fs
        .readdirSync(assetsFontsDir)
        .filter(file => /\.(ttf|otf|ttc|woff|woff2)$/i.test(file));
      if (fontFiles.length > 0 && foundFonts.length === 0) {
        throw new Error(
          "Fonts exist in assets/fonts but none found in UIAppFonts array"
        );
      }
    }
  });

  // Test 33: Fonts - iOS link-assets-manifest.json contains fonts
  test("Check iOS link-assets-manifest.json contains fonts when fonts provided", () => {
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;

    const manifestPath = path.join(
      fontsProjectPath,
      "ios/link-assets-manifest.json"
    );

    if (!fs.existsSync(manifestPath)) {
      throw new Error("iOS link-assets-manifest.json not found");
    }

    const manifestContent = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    if (!manifest.data || manifest.data.length === 0) {
      // If no fonts provided, manifest should be empty - this is OK
      log("No fonts in manifest (fonts not provided), skipping", "info");
      return;
    }

    // Check that fonts are in the manifest
    const fontEntries = manifest.data.filter(
      entry => entry.path && entry.path.includes("assets/fonts/")
    );

    if (fontEntries.length === 0) {
      throw new Error("No font entries found in iOS link-assets-manifest.json");
    }

    // Check that each font entry has path and sha1
    for (const entry of fontEntries) {
      if (!entry.path) {
        throw new Error("Font entry in manifest missing path");
      }
      if (!entry.sha1) {
        throw new Error(`Font entry ${entry.path} missing sha1 hash`);
      }
    }
  });

  // Test 34: Fonts - react-native.config.js contains assets array when fonts provided
  test("Check react-native.config.js contains assets array when fonts provided", () => {
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;

    const configPath = path.join(fontsProjectPath, "react-native.config.js");

    if (!fs.existsSync(configPath)) {
      throw new Error("react-native.config.js not found");
    }

    const configContent = fs.readFileSync(configPath, "utf8");

    // Check if fonts are in assets/fonts
    const assetsFontsDir = path.join(fontsProjectPath, "assets/fonts");
    if (fs.existsSync(assetsFontsDir)) {
      const fontFiles = fs
        .readdirSync(assetsFontsDir)
        .filter(file => /\.(ttf|otf|ttc|woff|woff2)$/i.test(file));

      if (fontFiles.length > 0) {
        // If fonts exist, react-native.config.js should have assets array
        if (!configContent.includes('assets: ["./assets/fonts"]')) {
          throw new Error(
            "Fonts exist in assets/fonts but react-native.config.js missing assets array"
          );
        }
      }
    }
  });

  // Test 35: Fonts - iOS project.pbxproj contains font references
  test("Check iOS project.pbxproj contains font references when fonts provided", () => {
    if (!WITH_FONTS_PROJECT_PATH || !fs.existsSync(WITH_FONTS_PROJECT_PATH)) {
      log("Fonts test project not created, skipping font tests", "info");
      return;
    }

    const fontsProjectPath = WITH_FONTS_PROJECT_PATH;
    const pbxprojPath = path.join(
      fontsProjectPath,
      `ios/${WITH_FONTS_PROJECT.name}.xcodeproj/project.pbxproj`
    );

    if (!fs.existsSync(pbxprojPath)) {
      throw new Error("iOS project.pbxproj not found");
    }

    const pbxprojContent = fs.readFileSync(pbxprojPath, "utf8");

    // Check if fonts are in assets/fonts
    const assetsFontsDir = path.join(fontsProjectPath, "assets/fonts");
    if (fs.existsSync(assetsFontsDir)) {
      const fontFiles = fs
        .readdirSync(assetsFontsDir)
        .filter(file => /\.(ttf|otf|ttc|woff|woff2)$/i.test(file));

      if (fontFiles.length > 0) {
        // Check that fonts are referenced in project.pbxproj
        // Fonts should appear as PBXFileReference entries
        for (const fontFile of fontFiles) {
          // Check for PBXFileReference with font name
          const fontRefPattern = new RegExp(
            `PBXFileReference[^}]*name = "${fontFile.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}"`,
            "g"
          );
          if (!fontRefPattern.test(pbxprojContent)) {
            throw new Error(
              `Font ${fontFile} not found as PBXFileReference in project.pbxproj`
            );
          }

          // Check that font is referenced in the project
          const fontInProject = pbxprojContent.includes(fontFile);
          if (!fontInProject) {
            throw new Error(
              `Font ${fontFile} not referenced in project.pbxproj`
            );
          }
        }
      }
    }
  });
};
