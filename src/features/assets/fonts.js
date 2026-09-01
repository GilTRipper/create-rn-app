const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const crypto = require("crypto");

async function calculateFileSha1(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash("sha1");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

async function updateLinkAssetsManifest(projectPath, fontFiles) {
  const manifestPathAndroid = path.join(
    projectPath,
    "android",
    "link-assets-manifest.json"
  );
  const manifestPathIos = path.join(
    projectPath,
    "ios",
    "link-assets-manifest.json"
  );

  const manifestData = {
    migIndex: 1,
    data: [],
  };

  // Calculate sha1 for each font file and add to manifest
  for (const fontFile of fontFiles) {
    const fontPath = path.join(projectPath, "assets", "fonts", fontFile);
    if (await fs.pathExists(fontPath)) {
      const sha1 = await calculateFileSha1(fontPath);
      manifestData.data.push({
        path: `assets/fonts/${fontFile}`,
        sha1: sha1,
      });
    }
  }

  // Write to both Android and iOS manifest files
  await fs.writeFile(
    manifestPathAndroid,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(
    manifestPathIos,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf8"
  );
}

async function addFontsToInfoPlistForPath(infoPlistPath, fontFiles) {
  if (!(await fs.pathExists(infoPlistPath))) {
    return;
  }

  let content = await fs.readFile(infoPlistPath, "utf8");

  // Check if UIAppFonts already exists
  const hasUIAppFonts = content.includes("<key>UIAppFonts</key>");

  if (!hasUIAppFonts) {
    // Add UIAppFonts array before closing </dict>
    const fontStrings = fontFiles
      .map(font => `\t\t<string>${font}</string>`)
      .join("\n");
    const uiAppFontsSection = `\t<key>UIAppFonts</key>
\t<array>
${fontStrings}
\t</array>`;

    content = content.replace(
      /(\t<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>)/,
      `$1\n${uiAppFontsSection}`
    );

    await fs.writeFile(infoPlistPath, content, "utf8");
  } else {
    // Update existing UIAppFonts array - find the array and add missing fonts
    const arrayStart = content.indexOf("<key>UIAppFonts</key>");
    if (arrayStart !== -1) {
      const arrayContentStart = content.indexOf("<array>", arrayStart);
      const arrayEnd = content.indexOf("</array>", arrayStart);
      if (arrayContentStart !== -1 && arrayEnd !== -1) {
        const existingArrayContent = content.substring(
          arrayContentStart + 7,
          arrayEnd
        );
        const existingFonts = (
          existingArrayContent.match(/<string>([^<]+)<\/string>/g) || []
        ).map(match => match.replace(/<string>|<\/string>/g, "").trim());

        const missingFonts = fontFiles.filter(
          font => !existingFonts.includes(font)
        );

        if (missingFonts.length > 0) {
          const newFontStrings = missingFonts
            .map(font => `\t\t<string>${font}</string>`)
            .join("\n");
          content =
            content.substring(0, arrayEnd) +
            "\n" +
            newFontStrings +
            "\n\t" +
            content.substring(arrayEnd);
          await fs.writeFile(infoPlistPath, content, "utf8");
        }
      }
    }
  }
}

async function addFontsToInfoPlist(projectPath, projectName, fontFiles) {
  const infoPlistPath = path.join(projectPath, `ios/${projectName}/Info.plist`);
  await addFontsToInfoPlistForPath(infoPlistPath, fontFiles);
}

async function addInfoPlistsToXcodeProject(
  projectPath,
  projectName,
  envInfoPlists,
  pbxprojPath
) {
  if (!envInfoPlists || envInfoPlists.length === 0) {
    return;
  }

  if (!(await fs.pathExists(pbxprojPath))) {
    return;
  }

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Check which Info.plist files are already added
  const existingPlists = new Set();
  const plistRegex = /\/\* ([^\s]+-Info\.plist) \*\//gi;
  let match;
  while ((match = plistRegex.exec(content)) !== null) {
    existingPlists.add(match[1]);
  }

  // Filter out plists that are already in the project
  const plistsToAdd = envInfoPlists.filter(
    ({ fileName }) => !existingPlists.has(fileName)
  );

  if (plistsToAdd.length === 0) {
    return; // All plists already added
  }

  // Generate UUIDs for each new Info.plist file
  const plistRefs = {};
  for (const { env, path: plistPath, fileName } of plistsToAdd) {
    const fileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    plistRefs[env] = { fileRef, plistFileName: fileName, plistPath };
  }

  // Add PBXFileReference entries
  const fileRefSection = `/* Begin PBXFileReference section */`;
  const fileRefIndex = content.indexOf(fileRefSection);
  if (fileRefIndex !== -1) {
    const fileRefEnd = content.indexOf("/* End PBXFileReference section */");
    if (fileRefEnd !== -1) {
      const fileRefEntries = Object.entries(plistRefs)
        .map(
          ([env, refs]) =>
            `\t\t${refs.fileRef} /* ${refs.plistFileName} */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; name = "${refs.plistFileName}"; path = "${projectName}/${refs.plistFileName}"; sourceTree = "<group>"; };`
        )
        .join("\n");

      content =
        content.substring(0, fileRefEnd) +
        "\n" +
        fileRefEntries +
        "\n" +
        content.substring(fileRefEnd);
    }
  }

  // Add to project group (13B07FAE1A68108700A75B9A is the fixed ID for the main project group)
  // Find the PBXGroup section for the project folder
  const projectGroupRegex = new RegExp(
    `13B07FAE1A68108700A75B9A /\\* .*? \\*/ = \\{[\\s\\S]*?children = \\(([\\s\\S]*?)\\);`,
    "m"
  );
  const projectGroupMatch = content.match(projectGroupRegex);
  if (projectGroupMatch) {
    const matchIndex = projectGroupMatch.index;
    const fullMatch = projectGroupMatch[0];
    const childrenContent = projectGroupMatch[1];
    const childrenStartPos =
      matchIndex + fullMatch.indexOf("children = (") + 12;
    const childrenEndPos = childrenStartPos + childrenContent.length;

    const childrenEntries = Object.entries(plistRefs)
      .map(
        ([env, refs]) => `\t\t\t\t${refs.fileRef} /* ${refs.plistFileName} */,`
      )
      .join("\n");

    content =
      content.substring(0, childrenEndPos) +
      "\n" +
      childrenEntries +
      "\n" +
      content.substring(childrenEndPos);
  }

  // CRITICAL: Before writing, verify staging targets still have correct config list IDs
  // This function runs AFTER createIosTargetsForEnvs, so we need to ensure nothing broke
  // Find all environment targets (targets with names like "{projectName}Staging", "{projectName}Dev", etc.)
  // by searching for config lists with environment target names
  const envTargetPattern = new RegExp(
    `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${projectName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}([^"]+)"\\s*\\*/`,
    "g"
  );

  let envMatch;
  while ((envMatch = envTargetPattern.exec(content)) !== null) {
    const configListId = envMatch[1];
    const envSuffix = envMatch[2];
    const targetName = `${projectName}${envSuffix}`;

    // Skip if it's the base target (no suffix)
    if (!envSuffix || envSuffix.trim() === "") continue;

    // Find target ID
    const targetIdMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\*/`
      )
    );

    if (targetIdMatch) {
      const targetId = targetIdMatch[1];

      // Find current config list ID in target
      const currentMatch = content.match(
        new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "([^"]*)"\\s*\\*/)`,
          "m"
        )
      );

      if (
        currentMatch &&
        (currentMatch[2] !== configListId || currentMatch[4] !== targetName)
      ) {
        console.log(
          chalk.red(
            `❌ AFTER INFO PLISTS: ${targetName} has wrong config! Expected ID: ${configListId}, Comment: ${targetName}. Found ID: ${currentMatch[2]}, Comment: ${currentMatch[4]}. Fixing...`
          )
        );
        content = content.replace(
          new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentMatch[2].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "m"
          ),
          `$1${configListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
        console.log(
          chalk.green(
            `✅ Fixed config list ID for ${targetName} after Info.plists update`
          )
        );
      }
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
}

async function addFontsToXcodeProject(projectPath, projectName, fontFiles) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) {
    return;
  }

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Check which fonts are already added
  const existingFonts = new Set();
  const fontRegex = /\/\* ([^\s]+\.(ttf|otf|ttc|woff|woff2)) \*\//gi;
  let match;
  while ((match = fontRegex.exec(content)) !== null) {
    existingFonts.add(match[1]);
  }

  // Filter out fonts that are already in the project
  const fontsToAdd = fontFiles.filter(font => !existingFonts.has(font));

  if (fontsToAdd.length === 0) {
    return; // All fonts already added
  }

  // Generate UUIDs for each new font file (24 char hex)
  const fontRefs = {};
  for (const fontFile of fontsToAdd) {
    // Generate 24 character hex UUID
    const fileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    const buildFileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    fontRefs[fontFile] = { fileRef, buildFileRef };
  }

  // Add PBXFileReference entries
  const fileRefSection = `/* Begin PBXFileReference section */`;
  const fileRefIndex = content.indexOf(fileRefSection);
  if (fileRefIndex !== -1) {
    const fileRefEnd = content.indexOf("/* End PBXFileReference section */");
    if (fileRefEnd !== -1) {
      const fileRefEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t${refs.fileRef} /* ${fontFile} */ = {isa = PBXFileReference; explicitFileType = undefined; fileEncoding = 9; includeInIndex = 0; lastKnownFileType = unknown; name = "${fontFile}"; path = "../assets/fonts/${fontFile}"; sourceTree = "<group>"; };`
        )
        .join("\n");

      content =
        content.substring(0, fileRefEnd) +
        "\n" +
        fileRefEntries +
        "\n" +
        content.substring(fileRefEnd);
    }
  }

  // Add PBXBuildFile entries
  const buildFileSection = `/* Begin PBXBuildFile section */`;
  const buildFileIndex = content.indexOf(buildFileSection);
  if (buildFileIndex !== -1) {
    const buildFileEnd = content.indexOf("/* End PBXBuildFile section */");
    if (buildFileEnd !== -1) {
      const buildFileEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t${refs.buildFileRef} /* ${fontFile} in Resources */ = {isa = PBXBuildFile; fileRef = ${refs.fileRef} /* ${fontFile} */; };`
        )
        .join("\n");

      content =
        content.substring(0, buildFileEnd) +
        "\n" +
        buildFileEntries +
        "\n" +
        content.substring(buildFileEnd);
    }
  }

  // Add to Resources group
  const resourcesGroupStart = content.indexOf(
    `0A994B0844B5445E81562B86 /* Resources */ = {`
  );
  if (resourcesGroupStart !== -1) {
    const resourcesGroupChildrenStart = content.indexOf(
      "children = (",
      resourcesGroupStart
    );
    const resourcesGroupChildrenEnd = content.indexOf(
      ");",
      resourcesGroupChildrenStart
    );
    if (
      resourcesGroupChildrenStart !== -1 &&
      resourcesGroupChildrenEnd !== -1
    ) {
      const childrenEntries = Object.entries(fontRefs)
        .map(([fontFile, refs]) => `\t\t\t\t${refs.fileRef} /* ${fontFile} */,`)
        .join("\n");

      content =
        content.substring(0, resourcesGroupChildrenEnd) +
        "\n" +
        childrenEntries +
        "\n" +
        content.substring(resourcesGroupChildrenEnd);
    }
  }

  // Add to PBXResourcesBuildPhase
  const resourcesBuildPhaseStart = content.indexOf(
    `13B07F8E1A680F5B00A75B9A /* Resources */ = {`
  );
  if (resourcesBuildPhaseStart !== -1) {
    const resourcesBuildPhaseFilesStart = content.indexOf(
      "files = (",
      resourcesBuildPhaseStart
    );
    const resourcesBuildPhaseFilesEnd = content.indexOf(
      ");",
      resourcesBuildPhaseFilesStart
    );
    if (
      resourcesBuildPhaseFilesStart !== -1 &&
      resourcesBuildPhaseFilesEnd !== -1
    ) {
      const filesEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t\t\t${refs.buildFileRef} /* ${fontFile} in Resources */,`
        )
        .join("\n");

      content =
        content.substring(0, resourcesBuildPhaseFilesEnd) +
        "\n" +
        filesEntries +
        "\n" +
        content.substring(resourcesBuildPhaseFilesEnd);
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
}

async function copyFonts(fontsDir, projectPath, projectName) {
  if (!fontsDir) {
    return; // Skip if no fonts directory provided
  }

  const spinner = ora("Copying and linking fonts...").start();

  try {
    // Check if directory exists
    if (!(await fs.pathExists(fontsDir))) {
      spinner.warn("Fonts directory does not exist, skipping...");
      return;
    }

    // Ensure assets/fonts directory exists in project
    const targetFontsDir = path.join(projectPath, "assets", "fonts");
    await fs.ensureDir(targetFontsDir);

    // Ensure android/app/src/main/assets/fonts directory exists
    const androidFontsDir = path.join(
      projectPath,
      "android/app/src/main/assets/fonts"
    );
    await fs.ensureDir(androidFontsDir);

    // Read all files from source directory
    const files = await fs.readdir(fontsDir);

    // Filter only font files (ttf, otf, ttc)
    const fontFiles = files.filter(file =>
      /\.(ttf|otf|ttc|woff|woff2)$/i.test(file)
    );

    if (fontFiles.length === 0) {
      spinner.warn("No font files found in fonts directory, skipping...");
      return;
    }

    // Copy all font files to assets/fonts
    for (const fontFile of fontFiles) {
      const sourceFile = path.join(fontsDir, fontFile);
      const targetFile = path.join(targetFontsDir, fontFile);
      await fs.copy(sourceFile, targetFile);

      // Also copy to android/app/src/main/assets/fonts
      const androidTargetFile = path.join(androidFontsDir, fontFile);
      await fs.copy(sourceFile, androidTargetFile);
    }

    spinner.succeed(`Copied ${fontFiles.length} font file(s)`);

    // Update link-assets-manifest.json files
    spinner.start("Updating link-assets-manifest.json files...");
    try {
      await updateLinkAssetsManifest(projectPath, fontFiles);
      spinner.succeed("Updated link-assets-manifest.json files");
    } catch (error) {
      spinner.warn("Failed to update link-assets-manifest.json files");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update Info.plist with UIAppFonts
    spinner.start("Updating Info.plist...");
    try {
      await addFontsToInfoPlist(projectPath, projectName, fontFiles);
      spinner.succeed("Updated Info.plist");
    } catch (error) {
      spinner.warn("Failed to update Info.plist");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update Xcode project.pbxproj
    spinner.start("Updating Xcode project...");
    try {
      await addFontsToXcodeProject(projectPath, projectName, fontFiles);
      spinner.succeed("Updated Xcode project");
    } catch (error) {
      spinner.warn("Failed to update Xcode project");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update react-native.config.js to include fonts
    const configPath = path.join(projectPath, "react-native.config.js");
    if (await fs.pathExists(configPath)) {
      try {
        let configContent = await fs.readFile(configPath, "utf8");

        // Check if assets already exists
        if (!configContent.includes('assets: ["./assets/fonts"]')) {
          // Add assets array before the closing brace of module.exports
          // Find the last closing brace of the main object and add assets before it
          const lines = configContent.split("\n");
          let lastBraceIndex = -1;

          // Find the last closing brace that's not part of nested objects
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === "}" || lines[i].trim() === "};") {
              lastBraceIndex = i;
              break;
            }
          }

          if (lastBraceIndex > 0) {
            // Get the indentation from the line before the closing brace
            const indentMatch = lines[lastBraceIndex - 1].match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : "  ";

            // Insert assets line before the closing brace
            lines.splice(
              lastBraceIndex,
              0,
              `${indent}assets: ["./assets/fonts"],`
            );

            configContent = lines.join("\n");
            await fs.writeFile(configPath, configContent, "utf8");
          }
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            `Warning: Failed to update react-native.config.js: ${error.message}`
          )
        );
      }
    }
  } catch (error) {
    spinner.fail("Failed to copy fonts");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

module.exports = {
  calculateFileSha1,
  updateLinkAssetsManifest,
  addFontsToInfoPlistForPath,
  addFontsToInfoPlist,
  addInfoPlistsToXcodeProject,
  addFontsToXcodeProject,
  copyFonts,
};
