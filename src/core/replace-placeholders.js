const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { replaceInFile } = require("../utils");

async function replacePlaceholders({
  projectPath,
  projectName,
  bundleIdentifier,
  displayName,
}) {
    const replacements = {
      HelloWorld: projectName,
      helloworld: projectName.toLowerCase(),
      "com.helloworld": bundleIdentifier,
      "Hello World": displayName,
    };

    // Files to replace (excluding MainActivity.kt, MainApplication.kt, and build.gradle - they will be handled separately)
    const filesToReplace = [
      "package.json",
      "app.json",
      "index.js",
      "android/settings.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "ios/Podfile",
      "ios/HelloWorld/Info.plist",
      "ios/HelloWorld/AppDelegate.swift",
      "ios/HelloWorld.xcodeproj/project.pbxproj",
      "ios/HelloWorld.xcworkspace/contents.xcworkspacedata",
    ];

    for (const file of filesToReplace) {
      const filePath = path.join(projectPath, file);
      if (await fs.pathExists(filePath)) {
        await replaceInFile(filePath, replacements);
      }
    }

    // Special handling for app.json to ensure displayName is set correctly
    const appJsonPath = path.join(projectPath, "app.json");
    if (await fs.pathExists(appJsonPath)) {
      let appJsonContent = await fs.readFile(appJsonPath, "utf8");
      try {
        const appJson = JSON.parse(appJsonContent);
        // Ensure displayName is set correctly
        if (appJson.displayName !== displayName) {
          appJson.displayName = displayName;
          appJsonContent = JSON.stringify(appJson, null, 2);
          await fs.writeFile(appJsonPath, appJsonContent, "utf8");
        }
      } catch (error) {
        // If JSON parsing fails, the replaceInFile should have handled it
        console.log(
          chalk.yellow(`Warning: Could not parse app.json: ${error.message}`)
        );
      }
    }

    // Ensure package attribute on AndroidManifest.xml
    const androidManifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    // Note: We don't add package attribute to AndroidManifest.xml as it causes errors
    // The package is determined by the namespace in build.gradle

    // Process build.gradle separately with replacements
    const buildGradlePath = path.join(projectPath, "android/app/build.gradle");
    if (await fs.pathExists(buildGradlePath)) {
      await replaceInFile(buildGradlePath, replacements);

      // Then force correct namespace and applicationId (after all replacements)
      let buildGradleContent = await fs.readFile(buildGradlePath, "utf8");
      // Force correct namespace - replace any namespace with correct one
      buildGradleContent = buildGradleContent.replace(
        /namespace\s+"[^"]+"/g,
        `namespace "${bundleIdentifier}"`
      );
      // Force correct applicationId in defaultConfig
      // Find defaultConfig block and replace applicationId inside it
      const defaultConfigRegex = /(defaultConfig\s*\{)([\s\S]*?)(\})/;
      const defaultConfigMatch = buildGradleContent.match(defaultConfigRegex);
      if (defaultConfigMatch) {
        let defaultConfigContent = defaultConfigMatch[2];
        // Replace applicationId in defaultConfig block
        defaultConfigContent = defaultConfigContent.replace(
          /applicationId\s+"[^"]+"/,
          `applicationId "${bundleIdentifier}"`
        );
        // Reconstruct the defaultConfig block
        buildGradleContent = buildGradleContent.replace(
          defaultConfigRegex,
          `${defaultConfigMatch[1]}${defaultConfigContent}${defaultConfigMatch[3]}`
        );
      }
      await fs.writeFile(buildGradlePath, buildGradleContent, "utf8");
    }
}

module.exports = { replacePlaceholders };
