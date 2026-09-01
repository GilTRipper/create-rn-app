const fs = require("fs-extra");
const path = require("path");

async function renameNative({
  projectPath,
  projectName,
  bundleIdentifier,
  displayName,
}) {
    // Rename iOS folder
    const iosOldPath = path.join(projectPath, "ios/HelloWorld");
    const iosNewPath = path.join(projectPath, `ios/${projectName}`);
    if (await fs.pathExists(iosOldPath)) {
      await fs.move(iosOldPath, iosNewPath);
    }

    // Rename iOS xcodeproj
    const xcodeprojOldPath = path.join(projectPath, "ios/HelloWorld.xcodeproj");
    const xcodeprojNewPath = path.join(
      projectPath,
      `ios/${projectName}.xcodeproj`
    );
    if (await fs.pathExists(xcodeprojOldPath)) {
      await fs.move(xcodeprojOldPath, xcodeprojNewPath);
    }

    // Rename iOS xcworkspace
    const xcworkspaceOldPath = path.join(
      projectPath,
      "ios/HelloWorld.xcworkspace"
    );
    const xcworkspaceNewPath = path.join(
      projectPath,
      `ios/${projectName}.xcworkspace`
    );
    if (await fs.pathExists(xcworkspaceOldPath)) {
      await fs.move(xcworkspaceOldPath, xcworkspaceNewPath);
    }

    // Rename Android package directories (ensure correct nesting for multi-part IDs)
    const javaSrcPath = path.join(projectPath, "android/app/src/main/java");
    const androidOldPath = path.join(javaSrcPath, "com/helloworld");
    const bundleParts = bundleIdentifier.split(".");
    const androidNewPath = path.join(javaSrcPath, bundleParts.join("/"));
    if (await fs.pathExists(androidOldPath)) {
      await fs.ensureDir(path.dirname(androidNewPath));
      // Move the whole package tree into the correctly nested location
      await fs.move(androidOldPath, androidNewPath, { overwrite: true });

      // Replace package name in moved files (MainActivity.kt and MainApplication.kt)
      const mainActivityPath = path.join(androidNewPath, "MainActivity.kt");
      const mainApplicationPath = path.join(
        androidNewPath,
        "MainApplication.kt"
      );

      if (await fs.pathExists(mainActivityPath)) {
        let content = await fs.readFile(mainActivityPath, "utf8");
        // Force correct package declaration - replace any package declaration with correct one
        content = content.replace(
          /^package\s+[^\s\n]+/m,
          `package ${bundleIdentifier}`
        );
        // Replace getMainComponentName to use project name
        content = content.replace(
          /getMainComponentName\(\):\s*String\s*=\s*"[^"]+"/,
          `getMainComponentName(): String = "${projectName.toLowerCase()}"`
        );
        await fs.writeFile(mainActivityPath, content, "utf8");
      }

      if (await fs.pathExists(mainApplicationPath)) {
        let content = await fs.readFile(mainApplicationPath, "utf8");
        // Force correct package declaration - replace any package declaration with correct one
        content = content.replace(
          /^package\s+[^\s\n]+/m,
          `package ${bundleIdentifier}`
        );
        await fs.writeFile(mainApplicationPath, content, "utf8");
      }
    }

    // Force iOS bundle identifier to the provided value for base production target only
    // Environment targets will get their bundle identifiers set in createIosTargetsForEnvs
    // We need to do this AFTER creating environment targets to avoid conflicts
    // So this will be handled in the main flow after createIosTargetsForEnvs

    // Force iOS display name to provided value (and ensure key exists)
    const infoPlistPath = path.join(
      projectPath,
      `ios/${projectName}/Info.plist`
    );
    if (await fs.pathExists(infoPlistPath)) {
      let infoPlistContent = await fs.readFile(infoPlistPath, "utf8");

      const ensurePlistString = (content, key, value) => {
        const regex = new RegExp(
          `<key>${key}<\\/key>\\s*<string>[^<]*<\\/string>`,
          "m"
        );
        const replacement = `<key>${key}</key>\n\t<string>${value}</string>`;
        if (regex.test(content)) {
          return content.replace(regex, replacement);
        }
        // Insert before closing </dict> if the key is missing
        return content.replace(
          /<\/dict>\s*<\/plist>/m,
          `\t${replacement}\n</dict>\n</plist>`
        );
      };

      infoPlistContent = ensurePlistString(
        infoPlistContent,
        "CFBundleDisplayName",
        displayName
      );
      infoPlistContent = ensurePlistString(
        infoPlistContent,
        "CFBundleName",
        displayName
      );

      await fs.writeFile(infoPlistPath, infoPlistContent, "utf8");
    }

    // Force Android app_name to provided display name
    const stringsXmlPath = path.join(
      projectPath,
      "android/app/src/main/res/values/strings.xml"
    );
    if (await fs.pathExists(stringsXmlPath)) {
      let stringsContent = await fs.readFile(stringsXmlPath, "utf8");
      const regex = /<string name="app_name">[^<]*<\/string>/m;
      const replacement = `<string name="app_name">${displayName}</string>`;
      if (regex.test(stringsContent)) {
        stringsContent = stringsContent.replace(regex, replacement);
      } else {
        stringsContent = stringsContent.replace(
          /<\/resources>\s*$/m,
          `    ${replacement}\n</resources>`
        );
      }
      await fs.writeFile(stringsXmlPath, stringsContent, "utf8");
    }
}

module.exports = { renameNative };
