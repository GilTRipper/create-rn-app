const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { getEnvNameForScheme, genId } = require("../../shared/xcode");

function cloneBuildConfigBlock(baseBlock, newId, newName, envPlistName) {
  // Extract the original ID from the block
  const originalIdMatch = baseBlock.match(/^(\s*)(\w{24})\s\/\*.*?\*\//);
  if (!originalIdMatch) return baseBlock;

  const originalIndent = originalIdMatch[1];
  const originalId = originalIdMatch[2];

  // Replace ID in the first line, preserving original indentation
  let block = baseBlock.replace(
    new RegExp(`^\\s*${originalId}\\s/\\*.*?\\*/`),
    `${originalIndent}${newId} /* ${newName} */`
  );

  // Replace name and INFOPLIST_FILE
  // If newName contains spaces, it must be quoted in project.pbxproj
  const nameValue = newName.includes(" ") ? `"${newName}"` : newName;
  // Replace name field (outside buildSettings, at the end of the block)
  // Match: name = <value>; where value can be quoted or unquoted
  block = block.replace(/name = ("[^"]*"|[^;]+);/, `name = ${nameValue};`);
  // Replace INFOPLIST_FILE inside buildSettings
  // Extract project folder name from base block (format: projectName/Info.plist)
  const baseInfoplistMatch = baseBlock.match(/INFOPLIST_FILE = ([^;]+);/);
  let infoplistPath = envPlistName;
  if (baseInfoplistMatch) {
    const basePath = baseInfoplistMatch[1].trim().replace(/^"|"$/g, "");
    const projectFolder = basePath.split("/")[0];
    // Format: projectFolder/projectName env-Info.plist
    infoplistPath = `${projectFolder}/${envPlistName}`;
  }
  // Always quote the path (may contain spaces)
  const quotedPath = `"${infoplistPath}"`;
  block = block.replace(
    /INFOPLIST_FILE = [^;]+;/,
    `INFOPLIST_FILE = ${quotedPath};`
  );

  return block;
}

async function createIosTargetsForEnvs(
  selectedEnvs,
  projectPath,
  projectName,
  baseBundleIdentifier,
  displayName
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return null;

  const envs = selectedEnvs.filter(env => env.toLowerCase() !== "production");
  if (envs.length === 0) return null;

  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) return null;

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Locate base application target (first application PBXNativeTarget)
  // First find the PBXNativeTarget section
  const nativeTargetSectionMatch = content.match(
    /\/\* Begin PBXNativeTarget section \*\/\s*([\s\S]*?)\/\* End PBXNativeTarget section \*\//m
  );
  if (!nativeTargetSectionMatch) {
    console.log(chalk.yellow("⚠️  Could not find PBXNativeTarget section"));
    return null;
  }

  const nativeTargetSection = nativeTargetSectionMatch[1];

  // Find any PBXNativeTarget with application product type in that section
  const targetBlockRegex =
    /(\w{24}) \/\* .*? \*\/ = \{[\s\S]*?isa = PBXNativeTarget;[\s\S]*?productType = "com\.apple\.product-type\.application";[\s\S]*?\};/m;
  const targetBlockMatch = nativeTargetSection.match(targetBlockRegex);
  if (!targetBlockMatch) {
    console.log(
      chalk.yellow(
        "⚠️  Could not find base application target in PBXNativeTarget section"
      )
    );
    return null;
  }
  const targetBlock = targetBlockMatch[0];
  const baseTargetId = targetBlockMatch[1];

  // Extract IDs from the target block
  const configListMatch = targetBlock.match(
    /buildConfigurationList = (\w{24}) \/\* Build configuration list for PBXNativeTarget ".*?" \*\//
  );
  const productRefMatch = targetBlock.match(
    /productReference = (\w{24}) \/\* .*?\.app \*\//
  );

  if (!configListMatch || !productRefMatch) {
    console.log(
      chalk.yellow("⚠️  Could not extract IDs from base target block")
    );
    return null;
  }

  const baseConfigListId = configListMatch[1];
  const baseProductRefId = productRefMatch[1];

  // Base names
  const baseNameMatch = targetBlock.match(/name = ([^;]+);/);
  const baseName = baseNameMatch ? baseNameMatch[1].trim() : projectName;
  const baseProductNameMatch = targetBlock.match(
    /productReference = \w{24} \/\* (.*?)\.app \*\//
  );
  const baseProductName = baseProductNameMatch
    ? baseProductNameMatch[1]
    : baseName;

  // Sections
  const section = re => content.match(re)?.[0] || "";
  const fileRefSectionRe =
    /\/\* Begin PBXFileReference section \*\/[\s\S]*?\/\* End PBXFileReference section \*\//m;
  const nativeSectionRe =
    /\/\* Begin PBXNativeTarget section \*\/[\s\S]*?\/\* End PBXNativeTarget section \*\//m;
  const configListSectionRe =
    /\/\* Begin XCConfigurationList section \*\/[\s\S]*?\/\* End XCConfigurationList section \*\//m;
  const configSectionRe =
    /\/\* Begin XCBuildConfiguration section \*\/[\s\S]*?\/\* End XCBuildConfiguration section \*\//m;

  let fileRefSection = section(fileRefSectionRe);
  let nativeSection = section(nativeSectionRe);
  let configListSection = section(configListSectionRe);
  let configSection = section(configSectionRe);

  if (
    !fileRefSection ||
    !nativeSection ||
    !configListSection ||
    !configSection
  ) {
    console.log(
      chalk.yellow("⚠️  Could not find required sections in project.pbxproj")
    );
    return null;
  }

  const productsGroupRegex =
    /\/\* Products \*\/ = {\s*isa = PBXGroup;\s*children = \(\s*([\s\S]*?)\);\s*name = Products;/m;
  const productsMatch = content.match(productsGroupRegex);
  let productsChildren = productsMatch ? productsMatch[1] : "";

  const projectTargetsRegex =
    /targets = \(\s*([\s\S]*?)\);\s*\};\s*\/\* End PBXProject section \*\//m;
  const projectTargetsMatch = content.match(projectTargetsRegex);
  let projectTargets = projectTargetsMatch ? projectTargetsMatch[1] : "";

  // Find TargetAttributes section to add new targets
  const targetAttributesRegex = /TargetAttributes = \{([\s\S]*?)\};/m;
  const targetAttributesMatch = content.match(targetAttributesRegex);
  let targetAttributes = targetAttributesMatch ? targetAttributesMatch[1] : "";

  // Base product ref block
  const productRefRegex = new RegExp(
    `${baseProductRefId} /\\* .*?\\.app \\*/ = \\{[\\s\\S]*?\\};`,
    "m"
  );
  const productRefBlockMatch = content.match(productRefRegex);
  if (!productRefBlockMatch) {
    console.log(
      chalk.yellow(`⚠️  Could not find product reference ${baseProductRefId}`)
    );
    return null;
  }

  // Config list block and config blocks
  const configListRegex = new RegExp(
    `${baseConfigListId} /\\* Build configuration list for PBXNativeTarget ".*?" \\*/ = {[\\s\\S]*?buildConfigurations = \\(([^)]*?)\\);[\\s\\S]*?};`,
    "m"
  );
  const configListBlockMatch = content.match(configListRegex);
  if (!configListBlockMatch) {
    console.log(
      chalk.yellow(`⚠️  Could not find config list ${baseConfigListId}`)
    );
    return null;
  }
  const configIdsRaw = configListBlockMatch[1]
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // Extract only IDs (24 hex chars) from strings like "13B07F941A680F5B00A75B9A /* Debug */"
  const configIds = configIdsRaw
    .map(s => {
      const idMatch = s.match(/(\w{24})/);
      return idMatch ? idMatch[1] : null;
    })
    .filter(Boolean);

  if (configIds.length === 0) {
    console.log(chalk.yellow("⚠️  No config IDs found"));
    return null;
  }
  // Find config blocks in XCBuildConfiguration section
  const configSectionMatch = content.match(
    /\/\* Begin XCBuildConfiguration section \*\/\s*([\s\S]*?)\/\* End XCBuildConfiguration section \*\//m
  );
  if (!configSectionMatch) {
    console.log(
      chalk.yellow("⚠️  Could not find XCBuildConfiguration section")
    );
    return null;
  }

  const configSectionContent = configSectionMatch[1];
  const configBlocks = {};
  for (const id of configIds) {
    // Search within config section for better accuracy
    // Need to match the entire block including nested braces in buildSettings
    // Match from ID to the closing "};" - need to balance braces
    const idPattern = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blockStart = new RegExp(`${idPattern} /\\* .*? \\*/ = \\{`, "m");
    const startMatch = configSectionContent.match(blockStart);
    if (startMatch) {
      const startPos = startMatch.index;
      let braceCount = 1; // Start at 1 because we're already inside the opening brace
      let pos = startMatch[0].length + startPos;
      let foundEnd = false;

      // Find the matching closing brace
      while (pos < configSectionContent.length && !foundEnd) {
        const char = configSectionContent[pos];
        if (char === "{") braceCount++;
        if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            // Found the closing brace for our block
            // Check if next character is semicolon
            if (
              pos + 1 < configSectionContent.length &&
              configSectionContent[pos + 1] === ";"
            ) {
              const block = configSectionContent.substring(startPos, pos + 2); // +2 for "};"
              // Check if block contains invalid "Swift" field (without VERSION)
              configBlocks[id] = block;
              foundEnd = true;
            }
          }
        }
        pos++;
      }

      if (!foundEnd) {
        console.log(
          chalk.yellow(
            `⚠️  Could not find end of config block ${id} using brace matching, trying regex fallback...`
          )
        );
        // Fallback: try to find block using a more greedy approach
        // Match from ID to the last "};" before the next block or end of section
        const blockStartPos = configSectionContent.indexOf(id);
        if (blockStartPos !== -1) {
          // Find the next block start or end of section
          const nextBlockMatch = configSectionContent
            .substring(blockStartPos)
            .match(/\n\t\t\w{24} \/\*|$/);
          if (nextBlockMatch) {
            const potentialBlockEndPos = blockStartPos + nextBlockMatch.index;
            const potentialBlock = configSectionContent.substring(
              blockStartPos,
              potentialBlockEndPos
            );
            // Find the last "};" in this potential block that matches our block structure
            // Need to find the "};" that closes our specific block, not just any "};"
            let blockBraceCount = 1;
            let blockPos = "= {".length;
            let blockEndPos = -1;

            // Find the matching closing brace for our block
            while (blockPos < potentialBlock.length && blockEndPos === -1) {
              const char = potentialBlock[blockPos];
              if (char === "{") blockBraceCount++;
              if (char === "}") {
                blockBraceCount--;
                if (blockBraceCount === 0) {
                  // Found the closing brace for our block
                  if (
                    blockPos + 1 < potentialBlock.length &&
                    potentialBlock[blockPos + 1] === ";"
                  ) {
                    blockEndPos = blockPos + 2; // +2 for "};"
                  }
                }
              }
              blockPos++;
            }

            if (blockEndPos !== -1) {
              const block = potentialBlock.substring(0, blockEndPos);
              // Check if block contains invalid "Swift" field (without VERSION)

              configBlocks[id] = block;
              foundEnd = true;
            }
          }
        }

        // Final fallback: use non-greedy regex
        if (!foundEnd) {
          const blockRegex = new RegExp(
            `${idPattern} /\\* .*? \\*/ = \\{[\\s\\S]*?\\};`,
            "m"
          );
          const fallbackBlock = configSectionContent.match(blockRegex);
          if (fallbackBlock) {
            configBlocks[id] = fallbackBlock[0];
            foundEnd = true;
          }
        }
      }
    } else {
      // Fallback: search in full content
      const blockRegex = new RegExp(
        `${idPattern} /\\* .*? \\*/ = \\{[\\s\\S]*?\\};`,
        "m"
      );
      const fallbackBlock = content.match(blockRegex);
      if (fallbackBlock) configBlocks[id] = fallbackBlock[0];
    }
  }

  // Validate extracted blocks - ensure they have balanced braces and no duplicate fields
  for (const id of Object.keys(configBlocks)) {
    let block = configBlocks[id];
    const openBraces = (block.match(/\{/g) || []).length;
    const closeBraces = (block.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      // Try to fix by finding the correct end
      const blockStart = block.indexOf("= {");
      if (blockStart !== -1) {
        let braceCount = 1; // Start at 1 because we're already inside the opening brace
        let pos = blockStart + 3; // After "= {"
        let foundEnd = false;

        while (pos < block.length && !foundEnd) {
          const char = block[pos];
          if (char === "{") braceCount++;
          if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              // Found the closing brace
              // Check if next character is semicolon
              if (pos + 1 < block.length && block[pos + 1] === ";") {
                block = block.substring(0, pos + 2); // +2 for "};"
                configBlocks[id] = block;
                foundEnd = true;
              }
            }
          }
          pos++;
        }
      }
    }
    // Ensure block ends with "};"
    if (!block.trim().endsWith("};")) {
      block = block.trim() + "};";
      configBlocks[id] = block;
    }

    // Check for duplicate fields in buildSettings and remove them
    // Need to properly extract buildSettings with nested braces
    const buildSettingsStart = block.indexOf("buildSettings = {");
    if (buildSettingsStart !== -1) {
      let braceCount = 1;
      let pos = buildSettingsStart + "buildSettings = {".length;
      let buildSettingsEnd = -1;

      // Find the matching closing brace for buildSettings
      while (pos < block.length && buildSettingsEnd === -1) {
        const char = block[pos];
        if (char === "{") braceCount++;
        if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            buildSettingsEnd = pos;
          }
        }
        pos++;
      }

      if (buildSettingsEnd !== -1) {
        const buildSettings = block.substring(
          buildSettingsStart + "buildSettings = {".length,
          buildSettingsEnd
        );
        const fieldNames = new Set();
        const lines = buildSettings.split("\n");
        const cleanedLines = [];

        for (const line of lines) {
          // Match field name (e.g., "SWIFT_VERSION", "PRODUCT_NAME", etc.)
          // Also check for "Swift" without "VERSION" - this is invalid
          const fieldMatch = line.match(/^\s*([A-Z_][A-Z0-9_]*|Swift)\s*=/);
          if (fieldMatch) {
            const fieldName = fieldMatch[1];
            // Skip "Swift" without "VERSION" - this is invalid
            if (fieldName === "Swift" && !line.includes("SWIFT_VERSION")) {
              continue;
            }
            if (fieldNames.has(fieldName)) {
              // Skip duplicate field - keep only the first occurrence
              continue;
            }
            fieldNames.add(fieldName);
          }
          cleanedLines.push(line);
        }

        // Reconstruct block with cleaned buildSettings
        const cleanedBuildSettings = cleanedLines.join("\n");
        const beforeBuildSettings = block.substring(
          0,
          buildSettingsStart + "buildSettings = {".length
        );
        const afterBuildSettings = block.substring(buildSettingsEnd);
        block = beforeBuildSettings + cleanedBuildSettings + afterBuildSettings;
        configBlocks[id] = block;
      }
    }
  }

  const baseConfigIds = Object.keys(configBlocks);
  if (baseConfigIds.length === 0) {
    console.log(
      chalk.yellow(
        `⚠️  Could not find any config blocks for IDs: ${configIds.join(", ")}`
      )
    );
    return null;
  }

  const debugBase =
    baseConfigIds.length >= 1 ? configBlocks[baseConfigIds[0]] : null;
  const releaseBase =
    baseConfigIds.length > 1 ? configBlocks[baseConfigIds[1]] : debugBase;
  if (!debugBase || !releaseBase) {
    console.log(
      chalk.yellow(
        `⚠️  Could not find debug/release config blocks. Found ${baseConfigIds.length} blocks.`
      )
    );
    return null;
  }

  console.log(chalk.cyan(`Found base target: ${baseName} (${baseTargetId})`));
  console.log(chalk.cyan(`Creating ${envs.length} environment targets...`));

  const buildableRefs = {
    base: {
      id: baseTargetId,
      name: baseName,
      productName: baseProductName,
      ref: `<BuildableReference\n               BuildableIdentifier = "primary"\n               BlueprintIdentifier = "${baseTargetId}"\n               BuildableName = "${baseProductName}.app"\n               BlueprintName = "${baseName}"\n               ReferencedContainer = "container:${projectName}.xcodeproj">\n            </BuildableReference>`,
    },
    envs: {},
  };

  const baseBuildPhasesMatch = targetBlock.match(/buildPhases = \([\s\S]*?\);/);
  const buildPhasesBlock = baseBuildPhasesMatch ? baseBuildPhasesMatch[0] : "";

  for (const env of envs) {
    console.log(chalk.cyan(`  Creating target for ${env}...`));
    const capEnv = getEnvNameForScheme(env);
    const targetName = `${projectName}${capEnv}`;
    const productName = `${projectName}${capEnv}`;

    const newProductRefId = genId();
    const newTargetId = genId();
    const newConfigListId = genId();
    const newDebugConfigId = genId();
    const newReleaseConfigId = genId();

    // File reference - format exactly like original
    let newProductRef = productRefBlockMatch[0]
      .replace(baseProductRefId, newProductRefId)
      .replace(/\/\* .*?\.app \*\//g, `/* ${productName}.app */`)
      .replace(/path = .*?\.app;/, `path = ${productName}.app;`)
      .replace(/name = .*?\.app;/, `name = ${productName}.app;`);

    // Ensure it ends with semicolon and newline (preserve original format)
    newProductRef = newProductRef.trim();
    if (!newProductRef.endsWith(";")) {
      newProductRef += ";";
    }
    newProductRef += "\n";

    // Insert before the end marker - find last entry and insert after it
    const lastEntryMatch = fileRefSection.match(
      /(\t\t\w{24}[^\n]*;\n)(?=\/\* End PBXFileReference section \*\/)/
    );
    if (lastEntryMatch) {
      fileRefSection = fileRefSection.replace(
        lastEntryMatch[0],
        `${lastEntryMatch[1]}\t\t${newProductRef}`
      );
    } else {
      fileRefSection = fileRefSection.replace(
        "/* End PBXFileReference section */",
        `\t\t${newProductRef}/* End PBXFileReference section */`
      );
    }

    // Build configurations
    const plistName = `${projectName} ${env}-Info.plist`;
    // In working project, environment target configs have names "Debug" and "Release" (without target name prefix)
    // This matches the pattern in lepimvarim where staging configs are just "Debug" and "Release"
    let debugCfg = cloneBuildConfigBlock(
      debugBase,
      newDebugConfigId,
      "Debug",
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    debugCfg = debugCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    // Set bundle identifier for this environment target
    // In lepimvarim: production = com.lepim.varim, staging = com.lepim.varim.staging
    // Format: baseBundleIdentifier.env (lowercase)
    const lowerEnv = env.toLowerCase();
    const envBundleIdentifier = baseBundleIdentifier
      ? `${baseBundleIdentifier}.${lowerEnv}`
      : undefined;

    if (envBundleIdentifier) {
      const beforeBundleReplace = debugCfg;
      debugCfg = debugCfg.replace(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/,
        `PRODUCT_BUNDLE_IDENTIFIER = ${envBundleIdentifier};`
      );
      if (beforeBundleReplace === debugCfg) {
        console.log(
          chalk.yellow(
            `⚠️  Could not replace bundle ID in debug config for ${targetName}. Bundle ID pattern not found.`
          )
        );
      } else {
        console.log(
          chalk.green(
            `✅ Set bundle ID for ${targetName} Debug: ${envBundleIdentifier}`
          )
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  No bundle identifier provided for ${targetName}, using default`
        )
      );
    }

    let releaseCfg = cloneBuildConfigBlock(
      releaseBase,
      newReleaseConfigId,
      "Release",
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    releaseCfg = releaseCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    // Set bundle identifier for release config too
    if (envBundleIdentifier) {
      const beforeBundleReplace = releaseCfg;
      releaseCfg = releaseCfg.replace(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/,
        `PRODUCT_BUNDLE_IDENTIFIER = ${envBundleIdentifier};`
      );
      if (beforeBundleReplace === releaseCfg) {
        console.log(
          chalk.yellow(
            `⚠️  Could not replace bundle ID in release config for ${targetName}. Bundle ID pattern not found.`
          )
        );
      } else {
        console.log(
          chalk.green(
            `✅ Set bundle ID for ${targetName} Release: ${envBundleIdentifier}`
          )
        );
      }
    }

    // Remove baseConfigurationReference from environment targets
    // CocoaPods will set the correct reference when 'pod install' is run
    // This prevents errors about missing Pods files before pod install
    debugCfg = debugCfg.replace(
      /baseConfigurationReference\s*=\s*[^;]+;\s*/g,
      ""
    );
    releaseCfg = releaseCfg.replace(
      /baseConfigurationReference\s*=\s*[^;]+;\s*/g,
      ""
    );

    // Set INFOPLIST_KEY_CFBundleDisplayName for environment targets
    // This ensures each environment target has a distinct display name
    // In lepimvarim: staging uses "LepimVarim Staging" (displayName without spaces + " " + env name)
    // Format: `${displayName.replace(/\s+/g, "")} ${getEnvNameForScheme(env)}` for environment targets
    const cleanDisplayName = displayName
      ? displayName.replace(/\s+/g, "")
      : projectName;
    const envDisplayName = `${cleanDisplayName} ${getEnvNameForScheme(env)}`;
    // Check if INFOPLIST_KEY_CFBundleDisplayName already exists
    if (!debugCfg.includes("INFOPLIST_KEY_CFBundleDisplayName")) {
      // Add after INFOPLIST_FILE
      debugCfg = debugCfg.replace(
        /(INFOPLIST_FILE\s*=\s*[^;]+;\s*)/,
        `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";\n`
      );
    } else {
      // Update existing value
      debugCfg = debugCfg.replace(
        /INFOPLIST_KEY_CFBundleDisplayName\s*=\s*[^;]+;/,
        `INFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";`
      );
    }
    if (!releaseCfg.includes("INFOPLIST_KEY_CFBundleDisplayName")) {
      // Add after INFOPLIST_FILE
      releaseCfg = releaseCfg.replace(
        /(INFOPLIST_FILE\s*=\s*[^;]+;\s*)/,
        `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";\n`
      );
    } else {
      // Update existing value
      releaseCfg = releaseCfg.replace(
        /INFOPLIST_KEY_CFBundleDisplayName\s*=\s*[^;]+;/,
        `INFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";`
      );
    }

    // Preserve original formatting - blocks should already have correct tabs from cloneBuildConfigBlock
    // XCBuildConfiguration blocks end with "};" on a new line
    // Validate and fix block structure after replacements

    // Ensure blocks end properly - they should end with "};" and newline
    const debugCfgTrimmed = debugCfg.trim();
    if (!debugCfgTrimmed.endsWith("};")) {
      // Try to fix - find the last "};" or add it
      const lastBrace = debugCfgTrimmed.lastIndexOf("}");
      if (
        lastBrace !== -1 &&
        lastBrace + 1 < debugCfgTrimmed.length &&
        debugCfgTrimmed[lastBrace + 1] !== ";"
      ) {
        debugCfg = debugCfgTrimmed.substring(0, lastBrace + 1) + ";\n";
      } else if (!debugCfgTrimmed.endsWith("}")) {
        debugCfg = debugCfgTrimmed + "};\n";
      } else {
        debugCfg = debugCfgTrimmed + ";\n";
      }
    } else if (!debugCfg.endsWith("\n")) {
      debugCfg = debugCfgTrimmed + "\n";
    }

    // Validate block structure - check brace balance
    const debugOpen = (debugCfg.match(/\{/g) || []).length;
    const debugClose = (debugCfg.match(/\}/g) || []).length;
    if (debugOpen !== debugClose) {
      console.log(
        chalk.red(
          `❌ Debug config block brace mismatch: ${debugOpen} open, ${debugClose} close - BLOCK WILL BE SKIPPED`
        )
      );
      // Skip this block to prevent corruption
      continue;
    }

    const releaseCfgTrimmed = releaseCfg.trim();
    if (!releaseCfgTrimmed.endsWith("};")) {
      // Try to fix - find the last "};" or add it
      const lastBrace = releaseCfgTrimmed.lastIndexOf("}");
      if (
        lastBrace !== -1 &&
        lastBrace + 1 < releaseCfgTrimmed.length &&
        releaseCfgTrimmed[lastBrace + 1] !== ";"
      ) {
        releaseCfg = releaseCfgTrimmed.substring(0, lastBrace + 1) + ";\n";
      } else if (!releaseCfgTrimmed.endsWith("}")) {
        releaseCfg = releaseCfgTrimmed + "};\n";
      } else {
        releaseCfg = releaseCfgTrimmed + ";\n";
      }
    } else if (!releaseCfg.endsWith("\n")) {
      releaseCfg = releaseCfgTrimmed + "\n";
    }

    // Validate block structure - check brace balance
    const releaseOpen = (releaseCfg.match(/\{/g) || []).length;
    const releaseClose = (releaseCfg.match(/\}/g) || []).length;
    if (releaseOpen !== releaseClose) {
      console.log(
        chalk.red(
          `❌ Release config block brace mismatch: ${releaseOpen} open, ${releaseClose} close - BLOCK WILL BE SKIPPED`
        )
      );
      // Skip this block to prevent corruption
      continue;
    }

    // Insert before the end marker
    // XCBuildConfiguration blocks are multiline and end with "};"
    // Simply insert before the end marker to preserve structure
    configSection = configSection.replace(
      "/* End XCBuildConfiguration section */",
      `${debugCfg}${releaseCfg}/* End XCBuildConfiguration section */`
    );

    // In working project, config list comments use just "Debug" and "Release" (matching the config names)
    let newConfigList = `\t\t${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${newDebugConfigId} /* Debug */,\n\t\t\t\t${newReleaseConfigId} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};`;

    // CRITICAL: Verify that newConfigList uses correct config IDs
    const newConfigListConfigIds = newConfigList.match(/\w{24}/g) || [];
    const expectedConfigIds = [
      newConfigListId,
      newDebugConfigId,
      newReleaseConfigId,
    ];
    const hasCorrectIds = expectedConfigIds.every(id =>
      newConfigListConfigIds.includes(id)
    );
    if (!hasCorrectIds) {
      console.log(
        chalk.red(
          `❌ CRITICAL: newConfigList does not contain expected config IDs!`
        )
      );
    }

    // Ensure config list ends properly
    newConfigList = newConfigList.trim();
    if (!newConfigList.endsWith(";")) {
      newConfigList += ";";
    }
    newConfigList += "\n";

    // CRITICAL: Store expected config IDs before insertion
    const expectedConfigIdsBeforeInsert = [
      newDebugConfigId,
      newReleaseConfigId,
    ];

    // Insert before the end marker - find last complete block and insert after it
    // XCConfigurationList blocks are multiline and end with "};"
    const lastConfigListBlockMatch = configListSection.match(
      /(\t\t\w{24}[^}]*\};\n)(?=\/\* End XCConfigurationList section \*\/)/
    );
    const beforeInsert = configListSection;
    if (lastConfigListBlockMatch) {
      configListSection = configListSection.replace(
        lastConfigListBlockMatch[0],
        `${lastConfigListBlockMatch[1]}${newConfigList}`
      );
    } else {
      configListSection = configListSection.replace(
        "/* End XCConfigurationList section */",
        `${newConfigList}/* End XCConfigurationList section */`
      );
    }

    // Verify that newConfigList was added
    if (beforeInsert === configListSection) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Failed to add config list for ${targetName} to configListSection!`
        )
      );
    } else {
      // Verify the config list is in configListSection
      const verifyMatch = configListSection.match(
        new RegExp(
          `${newConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}"\\s*\\*/`
        )
      );
      if (!verifyMatch) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list for ${targetName} NOT found in configListSection after insertion!`
          )
        );
      }
    }

    // Native target - replace specific fields to avoid double replacement
    // IMPORTANT: Replace config list ID FIRST, before other ID replacements
    // This is critical - staging target MUST have its own config list ID
    const escapedBaseConfigListId = baseConfigListId.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    // Replace config list ID FIRST - use exact pattern matching
    // Format: buildConfigurationList = <ID> /* Build configuration list for PBXNativeTarget "..." */
    let newTarget = targetBlock;

    // CRITICAL: Replace config list ID FIRST, before any other replacements
    // Find the exact line with buildConfigurationList
    const configListLineMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})\s*\/\*\s*Build configuration list for PBXNativeTarget "[^"]*"\s*\*\//
    );

    if (configListLineMatch) {
      const currentConfigListId = configListLineMatch[1];

      // Replace it with newConfigListId - use a very precise pattern
      const replacePattern = new RegExp(
        `(buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
        "g"
      );

      const beforeReplace = newTarget;
      // CRITICAL: Replace with correct comment for this target
      newTarget = newTarget.replace(
        replacePattern,
        `$1${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );

      if (beforeReplace === newTarget) {
        console.log(
          chalk.red(
            `❌ ERROR: Replacement did not work! Pattern: ${replacePattern}`
          )
        );
      } else {
      }
    } else {
      console.log(
        chalk.red(
          `❌ ERROR: Could not find buildConfigurationList line in targetBlock!`
        )
      );
      // Try to find it without the comment
      const simpleMatch = newTarget.match(
        /buildConfigurationList\s*=\s*(\w{24})/
      );
      if (simpleMatch) {
        console.log(
          chalk.yellow(
            `⚠️  Found buildConfigurationList without comment: ${simpleMatch[1]}`
          )
        );
        // Try to replace it anyway - add correct comment
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${simpleMatch[1].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)?`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
        console.log(
          chalk.yellow(`⚠️  Attempted replacement without comment pattern`)
        );
      }
    }

    // Verify the replacement worked before continuing
    const verifyConfigListMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (verifyConfigListMatch) {
      const actualConfigListId = verifyConfigListMatch[1];
      if (actualConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL ERROR: Config list ID replacement failed! Expected ${newConfigListId}, but found ${actualConfigListId}`
          )
        );
        // Force the replacement if it failed
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${actualConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      } else {
      }
    }

    // Now replace other IDs - but be careful not to replace the config list ID again
    // IMPORTANT: Replace baseTargetId and baseProductRefId, but NOT newConfigListId
    // We need to protect newConfigListId from being replaced
    const escapedNewConfigListId = newConfigListId.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    // Replace baseTargetId, but be VERY careful not to replace config list ID
    // We need to protect newConfigListId from being replaced
    // Strategy: replace baseTargetId only if it's NOT part of buildConfigurationList line
    // and NOT the same as newConfigListId
    if (baseTargetId !== newConfigListId) {
      // Use a more precise pattern that explicitly excludes buildConfigurationList context
      newTarget = newTarget.replace(
        new RegExp(
          `(?<!buildConfigurationList\\s*=\\s*)${baseTargetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(?!\\s*/\\*\\s*Build configuration list)`,
          "g"
        ),
        newTargetId
      );
    } else {
    }

    // Replace baseProductRefId, but protect newConfigListId
    if (baseProductRefId !== newConfigListId) {
      newTarget = newTarget.replace(
        new RegExp(
          `${baseProductRefId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "g"
        ),
        newProductRefId
      );
    } else {
    }

    // Final verification: ensure config list ID is still correct after other replacements
    const finalVerifyMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (finalVerifyMatch && finalVerifyMatch[1] !== newConfigListId) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list ID was overwritten! Restoring to ${newConfigListId}`
        )
      );
      newTarget = newTarget.replace(
        new RegExp(
          `buildConfigurationList\\s*=\\s*${finalVerifyMatch[1].replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "g"
        ),
        `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );
    }

    // Then replace names in specific places (avoiding global replace)
    newTarget = newTarget.replace(
      new RegExp(`name = ${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`),
      `name = ${targetName};`
    );
    newTarget = newTarget.replace(
      new RegExp(
        `productName = ${baseProductName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )};`
      ),
      `productName = ${productName};`
    );

    // Replace in comment at the start of target block
    newTarget = newTarget.replace(
      new RegExp(
        `${newTargetId} /\\* ${baseName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )} \\*/`
      ),
      `${newTargetId} /* ${targetName} */`
    );
    newTarget = newTarget.replace(
      /productType = .*?;/,
      'productType = "com.apple.product-type.application";'
    );
    newTarget = newTarget.replace(
      new RegExp(`productReference = ${newProductRefId} /\\* .*?\\.app \\*/;`),
      `productReference = ${newProductRefId} /* ${productName}.app */;`
    );

    // Verify config list ID is still correct after name/product replacements
    const afterNameCheck = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (afterNameCheck && afterNameCheck[1] !== newConfigListId) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list ID was overwritten after name/product replacements! Restoring...`
        )
      );
      newTarget = newTarget.replace(
        new RegExp(
          `buildConfigurationList\\s*=\\s*${afterNameCheck[1].replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
          "g"
        ),
        `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );
    }

    // Create new build phases with new IDs for this target
    // In lepimvarim, each target has its own build phases with unique IDs
    // We need to create Sources, Frameworks, Resources, and Bundle React Native build phases
    // Pods build phases will be created by CocoaPods when 'pod install' is run
    const newSourcesPhaseId = genId();
    const newFrameworksPhaseId = genId();
    const newResourcesPhaseId = genId();
    const newBundleRnPhaseId = genId();

    // Find base build phases to copy structure from
    let baseSourcesPhase = null;
    let baseFrameworksPhase = null;
    let baseResourcesPhase = null;
    let baseBundleRnPhase = null;

    if (buildPhasesBlock) {
      const buildPhaseIds = buildPhasesBlock.match(/\w{24}/g) || [];

      for (const phaseId of buildPhaseIds) {
        // Find build phase block in content
        const phaseBlockMatch = content.match(
          new RegExp(
            `${phaseId}\\s*\\/\\*\\s*([^*]+)\\s*\\*\\/\\s*=\\s*\\{([\\s\\S]*?)\\};`,
            "m"
          )
        );
        if (!phaseBlockMatch) continue;

        const phaseName = phaseBlockMatch[1].trim();
        const phaseContent = phaseBlockMatch[2];

        // Identify phase type and copy structure (skip Pods phases - CocoaPods will create them)
        if (phaseName === "Sources" && !phaseName.includes("[CP]")) {
          baseSourcesPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName === "Frameworks" && !phaseName.includes("[CP]")) {
          baseFrameworksPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName === "Resources" && !phaseName.includes("[CP]")) {
          baseResourcesPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName.includes("Bundle React Native")) {
          baseBundleRnPhase = { id: phaseId, content: phaseContent };
        }
      }
    }

    // Create new build phases blocks
    // In reference project, each target's Sources phase contains only AppDelegate.swift
    // We need to find AppDelegate.swift from base Sources phase and add it to new Sources phase
    const sourcesSectionMatch = content.match(
      /\/\* Begin PBXSourcesBuildPhase section \*\/[\s\S]*?\/\* End PBXSourcesBuildPhase section \*\//m
    );
    if (sourcesSectionMatch && baseSourcesPhase) {
      // Extract files from base Sources phase - we only need AppDelegate.swift
      const baseFilesMatch = baseSourcesPhase.content.match(
        /files\s*=\s*\(([\s\S]*?)\);/
      );
      let newSourcesFiles = "";

      if (baseFilesMatch) {
        const baseFilesContent = baseFilesMatch[1];
        // Find AppDelegate.swift buildFile reference
        const appDelegateMatch = baseFilesContent.match(
          /(\w{24})\s*\/\*\s*AppDelegate\.swift\s+in\s+Sources\s*\*/
        );

        if (appDelegateMatch) {
          const existingBuildFileId = appDelegateMatch[1];

          // Find existing PBXBuildFile block to get fileRef
          const existingBuildFileBlock = content.match(
            new RegExp(
              `${existingBuildFileId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}\\s*/\\*\\s*AppDelegate\\.swift\\s+in\\s+Sources\\s*\\*/\\s*=\\s*\\{[^}]*fileRef\\s*=\\s*(\\w{24})[^}]*\\};`,
              "m"
            )
          );

          if (existingBuildFileBlock) {
            const fileRefId = existingBuildFileBlock[1];
            // Create new PBXBuildFile entry with new ID but same fileRef
            const newBuildFileId = genId();
            const buildFileContent = `\t\t${newBuildFileId} /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* AppDelegate.swift */; };`;

            // Add new PBXBuildFile entry to PBXBuildFile section
            content = content.replace(
              /(\/\* End PBXBuildFile section \*\/)/,
              `${buildFileContent}\n$1`
            );

            // Add to new Sources phase files list
            newSourcesFiles = `\t\t\t\t${newBuildFileId} /* AppDelegate.swift in Sources */,\n`;
          }
        }
      }

      // Create new Sources phase block with AppDelegate.swift only
      const newSourcesBlock = `\t\t${newSourcesPhaseId} /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${newSourcesFiles}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXSourcesBuildPhase section \*\/)/,
        `${newSourcesBlock}$1`
      );
    }

    const frameworksSectionMatch = content.match(
      /\/\* Begin PBXFrameworksBuildPhase section \*\/[\s\S]*?\/\* End PBXFrameworksBuildPhase section \*\//m
    );
    if (frameworksSectionMatch && baseFrameworksPhase) {
      const newFrameworksBlock = `\t\t${newFrameworksPhaseId} /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXFrameworksBuildPhase section \*\/)/,
        `${newFrameworksBlock}$1`
      );
    }

    // Create Resources phase and copy all files from base Resources phase
    // In reference project, staging Resources phase contains all the same files as base,
    // but with different buildFile IDs (same fileRef)
    const resourcesSectionMatch = content.match(
      /\/\* Begin PBXResourcesBuildPhase section \*\/[\s\S]*?\/\* End PBXResourcesBuildPhase section \*\//m
    );
    if (resourcesSectionMatch && baseResourcesPhase) {
      // Extract files from base Resources phase
      const baseFilesMatch = baseResourcesPhase.content.match(
        /files\s*=\s*\(([\s\S]*?)\);/
      );
      let newResourcesFiles = "";

      if (baseFilesMatch) {
        const baseFilesContent = baseFilesMatch[1];
        // Extract all buildFile references from base Resources phase
        const buildFileRefs =
          baseFilesContent.match(/(\w{24})\s*\/\*\s*([^*]+)\s*\*/g) || [];

        // For each buildFile, create a new PBXBuildFile entry with new ID but same fileRef
        const buildFileSectionMatch = content.match(
          /\/\* Begin PBXBuildFile section \*\/[\s\S]*?\/\* End PBXBuildFile section \*\//m
        );

        if (buildFileSectionMatch) {
          const newBuildFileEntries = [];

          for (const buildFileRef of buildFileRefs) {
            // Extract buildFile ID and file name
            const buildFileMatch = buildFileRef.match(
              /(\w{24})\s*\/\*\s*([^*]+)\s*\*/
            );
            if (buildFileMatch) {
              const existingBuildFileId = buildFileMatch[1];
              const fileName = buildFileMatch[2].trim();

              // Find existing PBXBuildFile block to get fileRef
              const existingBuildFileBlock = content.match(
                new RegExp(
                  `${existingBuildFileId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}\\s*/\\*\\s*${fileName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}\\s*\\*/\\s*=\\s*\\{[^}]*fileRef\\s*=\\s*(\\w{24})[^}]*\\};`,
                  "m"
                )
              );

              if (existingBuildFileBlock) {
                const fileRefId = existingBuildFileBlock[1];
                // Extract file name without " in Resources" suffix for fileRef comment
                const fileRefName = fileName.split(" in ")[0];
                // Create new PBXBuildFile entry with new ID but same fileRef
                const newBuildFileId = genId();
                const buildFileContent = `\t\t${newBuildFileId} /* ${fileName} */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* ${fileRefName} */; };`;
                newBuildFileEntries.push({
                  buildFileId: newBuildFileId,
                  fileName: fileName,
                  buildFileContent: buildFileContent,
                });

                // Add to new Resources phase files list
                newResourcesFiles += `\t\t\t\t${newBuildFileId} /* ${fileName} */,\n`;
              }
            }
          }

          // Add new PBXBuildFile entries to PBXBuildFile section
          if (newBuildFileEntries.length > 0) {
            const buildFileEntries = newBuildFileEntries
              .map(entry => entry.buildFileContent)
              .join("\n");
            content = content.replace(
              /(\/\* End PBXBuildFile section \*\/)/,
              `${buildFileEntries}\n$1`
            );
          }
        }
      }

      // Create new Resources phase block with files
      const newResourcesBlock = `\t\t${newResourcesPhaseId} /* Resources */ = {\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${newResourcesFiles}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXResourcesBuildPhase section \*\/)/,
        `${newResourcesBlock}$1`
      );
    }

    // Copy Bundle React Native phase if it exists
    if (baseBundleRnPhase) {
      // Find the block start
      const blockStartRegex = new RegExp(
        `(\\t\\t)${baseBundleRnPhase.id.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\/\\*\\s*([^*]+)\\s*\\*\\/\\s*=\\s*\\{`,
        "m"
      );
      const blockStartMatch = content.match(blockStartRegex);
      if (blockStartMatch) {
        const indent = blockStartMatch[1];
        const comment = blockStartMatch[2].trim();
        const blockStartPos = blockStartMatch.index + blockStartMatch[0].length;

        // Find the closing }; by counting braces
        let braceCount = 1; // Already inside opening brace
        let pos = blockStartPos;
        let foundEnd = false;
        let blockEndPos = -1;

        while (pos < content.length && !foundEnd) {
          const char = content[pos];
          if (char === "{") braceCount++;
          if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              // Check if next char is semicolon
              if (pos + 1 < content.length && content[pos + 1] === ";") {
                blockEndPos = pos + 2; // Include };
                foundEnd = true;
              }
            }
          }
          pos++;
        }

        if (foundEnd && blockEndPos > 0) {
          // Extract the complete block
          const originalBlock = content.substring(
            blockStartMatch.index,
            blockEndPos
          );
          // Replace ID with new ID
          const newBundleRnBlock = originalBlock.replace(
            new RegExp(
              baseBundleRnPhase.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "g"
            ),
            newBundleRnPhaseId
          );

          const shellScriptSectionMatch = content.match(
            /\/\* Begin PBXShellScriptBuildPhase section \*\/[\s\S]*?\/\* End PBXShellScriptBuildPhase section \*\//m
          );
          if (shellScriptSectionMatch) {
            content = content.replace(
              /(\/\* End PBXShellScriptBuildPhase section \*\/)/,
              `${newBundleRnBlock}\n$1`
            );
          }
        }
      }
    }

    // Create buildPhases list with new IDs (Pods phases will be added by CocoaPods)
    let newBuildPhasesBlock = "buildPhases = (\n";
    // Order: Sources, Frameworks, Resources, Bundle React Native (Pods phases will be added by CocoaPods)
    newBuildPhasesBlock += `\t\t\t\t${newSourcesPhaseId} /* Sources */,\n`;
    newBuildPhasesBlock += `\t\t\t\t${newFrameworksPhaseId} /* Frameworks */,\n`;
    newBuildPhasesBlock += `\t\t\t\t${newResourcesPhaseId} /* Resources */,\n`;
    if (baseBundleRnPhase) {
      newBuildPhasesBlock += `\t\t\t\t${newBundleRnPhaseId} /* Bundle React Native code and images */,\n`;
    }
    newBuildPhasesBlock += "\t\t\t);";

    // Replace buildPhases in new target
    const buildPhasesRegex = /buildPhases = \([\s\S]*?\);/m;
    if (buildPhasesRegex.test(newTarget)) {
      newTarget = newTarget.replace(buildPhasesRegex, newBuildPhasesBlock);

      // Verify config list ID is still correct after buildPhases replacement
      const afterBuildPhasesCheck = newTarget.match(
        /buildConfigurationList\s*=\s*(\w{24})/
      );
      if (
        afterBuildPhasesCheck &&
        afterBuildPhasesCheck[1] !== newConfigListId
      ) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list ID was overwritten after buildPhases replacement! Restoring...`
          )
        );
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${afterBuildPhasesCheck[1].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      }
    }
    // Preserve original formatting from targetBlock
    // CRITICAL: Final check before inserting - ensure config list ID is correct
    const finalCheckMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (finalCheckMatch) {
      const finalConfigListId = finalCheckMatch[1];
      if (finalConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list ID is wrong before insertion! Expected ${newConfigListId}, found ${finalConfigListId}. Fixing...`
          )
        );
        // Force replace one more time
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${finalConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      } else {
      }
    } else {
      console.log(
        chalk.red(
          `❌ CRITICAL: Could not find buildConfigurationList in newTarget before insertion!`
        )
      );
    }

    // Ensure target block ends properly
    newTarget = newTarget.trim();
    if (!newTarget.endsWith(";")) {
      newTarget += ";";
    }
    newTarget += "\n";

    // Insert before the end marker - find last complete block and insert after it
    // PBXNativeTarget blocks are multiline and end with "};"
    const lastNativeBlockMatch = nativeSection.match(
      /(\t\t\w{24}[^}]*\};\n)(?=\/\* End PBXNativeTarget section \*\/)/
    );
    if (lastNativeBlockMatch) {
      nativeSection = nativeSection.replace(
        lastNativeBlockMatch[0],
        `${lastNativeBlockMatch[1]}${newTarget}`
      );
    } else {
      nativeSection = nativeSection.replace(
        "/* End PBXNativeTarget section */",
        `${newTarget}/* End PBXNativeTarget section */`
      );
    }

    // CRITICAL: Verify that the inserted newTarget still has correct config list ID
    const insertedTargetMatch = nativeSection.match(
      new RegExp(
        `${newTargetId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})`
      )
    );
    if (insertedTargetMatch) {
      const insertedConfigListId = insertedTargetMatch[1];
      if (insertedConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL: After insertion, config list ID is wrong! Expected ${newConfigListId}, found ${insertedConfigListId}. Fixing in nativeSection...`
          )
        );
        // Fix it in nativeSection
        nativeSection = nativeSection.replace(
          new RegExp(
            `(${newTargetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${insertedConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "m"
          ),
          `$1${newConfigListId}$2`
        );
      } else {
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Could not find inserted target ${newTargetId} in nativeSection for verification`
        )
      );
    }

    buildableRefs.envs[env] = {
      id: newTargetId,
      name: targetName,
      productName,
      ref: `<BuildableReference\n               BuildableIdentifier = "primary"\n               BlueprintIdentifier = "${newTargetId}"\n               BuildableName = "${productName}.app"\n               BlueprintName = "${targetName}"\n               ReferencedContainer = "container:${projectName}.xcodeproj">\n            </BuildableReference>`,
    };

    // Products children
    productsChildren += `\n\t\t\t\t${newProductRefId} /* ${productName}.app */,`;

    // Project targets list
    projectTargets += `\n\t\t\t${newTargetId} /* ${targetName} */,`;

    // Add to TargetAttributes
    targetAttributes += `\n\t\t\t${newTargetId} = {\n\t\t\t\tLastSwiftMigration = 1120;\n\t\t\t};`;
  }

  // Reassemble content
  if (productsMatch) {
    const newProducts = productsMatch[0].replace(
      productsMatch[1],
      productsChildren
    );
    content = content.replace(productsGroupRegex, newProducts);
  }
  if (projectTargetsMatch) {
    const newTargetsBlock = projectTargetsMatch[0].replace(
      projectTargetsMatch[1],
      projectTargets
    );
    content = content.replace(projectTargetsRegex, newTargetsBlock);
  }

  // Update TargetAttributes
  if (targetAttributesMatch && targetAttributes) {
    const newTargetAttributes = targetAttributesMatch[0].replace(
      targetAttributesMatch[1],
      targetAttributes
    );
    content = content.replace(targetAttributesRegex, newTargetAttributes);
  }

  content = content.replace(fileRefSectionRe, fileRefSection);

  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to snapshot or verify
  // before replacement. The staging target should already have the correct buildConfigurationList ID
  // from createIosTargetsForEnvs.

  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks. The fix was only:
  // 1. Renamed comments in XCBuildConfiguration blocks (from "lepimvarimStg Debug" to "Debug")
  // 2. Removed duplicate configurations
  // 3. Fixed scheme file
  // So we don't need to verify or fix buildConfigurationList in nativeSection before replacement.
  // The staging target should already have the correct buildConfigurationList ID from createIosTargetsForEnvs.

  // Now replace nativeSection
  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to verify or fix after replacement
  content = content.replace(nativeSectionRe, nativeSection);

  // CRITICAL: Before replacing configListSection, verify that staging config lists are present
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Check if staging config list exists in configListSection
    const stagingConfigListMatch = configListSection.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!stagingConfigListMatch) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list for ${targetName} NOT found in configListSection before replacement!`
        )
      );
    } else {
      console.log(
        chalk.green(
          `✅ Verified: Config list for ${targetName} (ID: ${stagingConfigListMatch[1]}) found in configListSection before replacement`
        )
      );
    }
  }

  // CRITICAL: Before replacing configListSection, save staging config list IDs and their config IDs
  const stagingConfigListIds = {};
  const stagingConfigIds = {}; // Store expected config IDs for each staging target
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    const stagingConfigListMatch = configListSection.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
        "m"
      )
    );

    if (stagingConfigListMatch) {
      const configListId = stagingConfigListMatch[1];
      const configIdsInList = stagingConfigListMatch[2].match(/\w{24}/g) || [];
      stagingConfigListIds[targetName] = configListId;
      stagingConfigIds[targetName] = configIdsInList;
      console.log(
        chalk.cyan(
          `📸 Saved staging config list ID before replacement: ${targetName} -> ${configListId} with config IDs: ${configIdsInList.join(
            ", "
          )}`
        )
      );
    }
  }

  // CRITICAL: Before replacing, verify configListSection contains environment config lists
  console.log(
    chalk.cyan(
      `📸 configListSection length before replacement: ${configListSection.length}`
    )
  );
  // Check for all environment config lists (not just staging)
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;
    const envConfigListPattern = new RegExp(
      `Build configuration list for PBXNativeTarget "${targetName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}"`,
      "g"
    );
    const envConfigListsInSection =
      configListSection.match(envConfigListPattern);
    if (envConfigListsInSection) {
      console.log(
        chalk.green(
          `✅ Found ${envConfigListsInSection.length} config list(s) for ${targetName} in configListSection before replacement`
        )
      );
    } else {
      console.log(
        chalk.red(
          `❌ CRITICAL: NO config list found for ${targetName} in configListSection before replacement!`
        )
      );
    }
  }

  const beforeConfigListReplace = content;
  const configListSectionMatch = content.match(configListSectionRe);
  if (configListSectionMatch) {
    console.log(
      chalk.cyan(
        `📸 Found configListSection in content, length: ${configListSectionMatch[0].length}`
      )
    );
  } else {
    console.log(
      chalk.red(
        `❌ CRITICAL: Could not find configListSection in content using regex!`
      )
    );
  }

  content = content.replace(configListSectionRe, configListSection);

  // CRITICAL: Verify that staging config lists still have correct config IDs after replacement
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    if (stagingConfigListIds[targetName] && stagingConfigIds[targetName]) {
      const expectedConfigListId = stagingConfigListIds[targetName];
      const expectedConfigIds = stagingConfigIds[targetName];

      // Find config list in content after replacement
      const configListMatch = content.match(
        new RegExp(
          `${expectedConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
          "m"
        )
      );

      if (configListMatch) {
        const actualConfigIds = configListMatch[1].match(/\w{24}/g) || [];
        const matches = expectedConfigIds.every(id =>
          actualConfigIds.includes(id)
        );
        if (!matches) {
          console.log(
            chalk.red(
              `❌ AFTER configListSection replacement: ${targetName} config list has WRONG config IDs!`
            )
          );
          console.log(
            chalk.red(
              `   Expected: ${expectedConfigIds.join(
                ", "
              )}, Found: ${actualConfigIds.join(", ")}`
            )
          );
        } else {
          console.log(
            chalk.green(
              `✅ AFTER configListSection replacement: ${targetName} config list has correct config IDs: ${actualConfigIds.join(
                ", "
              )}`
            )
          );
        }
      }
    }
  }
  const afterConfigListReplace = content;

  // CRITICAL: Verify that configListSection replacement worked
  if (beforeConfigListReplace === afterConfigListReplace) {
    console.log(
      chalk.red(
        `❌ CRITICAL: configListSection replacement did NOT occur! The regex did not match!`
      )
    );
  } else {
    console.log(
      chalk.green(`✅ configListSection replacement occurred successfully`)
    );
  }

  // CRITICAL: Verify that staging config lists are still present after replacement
  for (const [targetName, expectedConfigListId] of Object.entries(
    stagingConfigListIds
  )) {
    const stagingConfigListAfterMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!stagingConfigListAfterMatch) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list for ${targetName} (ID: ${expectedConfigListId}) NOT found in content after replacement!`
        )
      );
    } else {
      const actualConfigListId = stagingConfigListAfterMatch[1];
      if (actualConfigListId === expectedConfigListId) {
        console.log(
          chalk.green(
            `✅ Verified: Config list for ${targetName} (ID: ${actualConfigListId}) preserved after replacement`
          )
        );
      } else {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list for ${targetName} has wrong ID! Expected ${expectedConfigListId}, found ${actualConfigListId}`
          )
        );
      }
    }
  }

  content = content.replace(configSectionRe, configSection);

  // CRITICAL: Verify that new config blocks were added to content
  // Check if newDebugConfigId and newReleaseConfigId exist in content after replacement
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find the config list ID for this target
    const targetConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );
    if (targetConfigListMatch) {
      const targetConfigListId = targetConfigListMatch[1];
      // Find config IDs in this config list
      const configListBlockMatch = content.match(
        new RegExp(
          `${targetConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
          "m"
        )
      );
      if (configListBlockMatch) {
        const configIdsInList = configListBlockMatch[1].match(/\w{24}/g) || [];
        console.log(
          chalk.cyan(
            `📋 After configSection replacement, ${targetName} config list contains: ${configIdsInList.join(
              ", "
            )}`
          )
        );

        // Check if these config IDs exist in configSection
        const configIdsExist = configIdsInList.every(id => {
          const exists = content.includes(`${id} /*`);
          if (!exists) {
            console.log(
              chalk.red(
                `❌ Config ID ${id} referenced in ${targetName} config list but NOT found in content!`
              )
            );
          }
          return exists;
        });
        if (!configIdsExist) {
          console.log(
            chalk.red(
              `❌ CRITICAL: Some config IDs in ${targetName} config list are missing from content!`
            )
          );
        }
      }
    }
  }

  // NOTE: In the reference project, there were NO fixes after nativeSection replacement
  // The fix was only in nativeSection before replacement (which we do above)
  // So we don't need to verify or fix after replacement

  // NOTE: In the reference project, there were NO final fixes after all replacements
  // The fix was only in nativeSection before replacement (which we do above)
  // So we don't need to verify or fix after all replacements

  // Validate that all blocks are properly closed
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    console.log(
      chalk.yellow(
        `⚠️  Warning: Mismatched braces in project.pbxproj (${openBraces} open, ${closeBraces} close)`
      )
    );

    // Try to find where the mismatch occurs by checking each section
    const sections = [
      { name: "PBXFileReference", content: fileRefSection },
      { name: "PBXNativeTarget", content: nativeSection },
      { name: "XCBuildConfiguration", content: configSection },
      { name: "XCConfigurationList", content: configListSection },
    ];

    for (const section of sections) {
      const sectionOpen = (section.content.match(/\{/g) || []).length;
      const sectionClose = (section.content.match(/\}/g) || []).length;
      if (sectionOpen !== sectionClose) {
        console.log(
          chalk.yellow(
            `  ⚠️  Mismatch in ${section.name} section: ${sectionOpen} open, ${sectionClose} close`
          )
        );
      }
    }
  }

  // Check for common syntax errors - missing semicolons after key-value pairs
  // Look for patterns like "ID" = { ... } without semicolon before closing brace of parent
  const missingSemicolonPattern = /(\w{24}\s*=\s*\{[^}]*\}\s*)(?!;)/g;
  const missingSemicolonMatches = content.match(missingSemicolonPattern);
  if (missingSemicolonMatches && missingSemicolonMatches.length > 0) {
    console.log(
      chalk.yellow(
        `⚠️  Warning: Found ${missingSemicolonMatches.length} potential missing semicolons in project.pbxproj`
      )
    );
  }

  // Add SWIFT_VERSION to project-level configurations (Debug and Release for PBXProject)
  // Project-level configs have name = Debug; or name = Release; (without target name prefix)
  // Find all config blocks and check if they are project-level (name doesn't contain target name)
  const configBlockRegex =
    /(\w{24}\s*\/\*\s*([^*]+)\s*\*\/\s*=\s*\{[\s\S]*?buildSettings\s*=\s*\{)([\s\S]*?)(\};[\s\S]*?name\s*=\s*([^;]+);[\s\S]*?\};)/g;
  content = content.replace(
    configBlockRegex,
    (
      match,
      beforeBuildSettings,
      commentName,
      buildSettings,
      afterBuildSettings,
      nameValue
    ) => {
      // Check if this is a project-level config (name is exactly "Debug" or "Release" without target name)
      // Remove quotes if present and trim
      const cleanName = nameValue.replace(/^["']|["']$/g, "").trim();
      const isProjectConfig =
        (cleanName === "Debug" || cleanName === "Release") &&
        !commentName.includes(projectName) &&
        !nameValue.includes(projectName);

      if (isProjectConfig && !buildSettings.includes("SWIFT_VERSION")) {
        // For Debug: add after SWIFT_ACTIVE_COMPILATION_CONDITIONS, before USE_HERMES
        if (cleanName === "Debug") {
          if (buildSettings.includes("SWIFT_ACTIVE_COMPILATION_CONDITIONS")) {
            buildSettings = buildSettings.replace(
              /(SWIFT_ACTIVE_COMPILATION_CONDITIONS\s*=\s*"[^"]+";\n)/,
              "$1\t\t\t\tSWIFT_VERSION = 5.0;\n"
            );
          } else if (buildSettings.includes("USE_HERMES")) {
            buildSettings = buildSettings.replace(
              /(USE_HERMES\s*=\s*[^;]+;\n)/,
              "\t\t\t\tSWIFT_VERSION = 5.0;\n$1"
            );
          } else {
            // Fallback: add before closing brace
            buildSettings = buildSettings.replace(
              /(\n\t\t\t\};)/,
              "\n\t\t\t\tSWIFT_VERSION = 5.0;$1"
            );
          }
        }
        // For Release: add after SDKROOT, before USE_HERMES
        else if (cleanName === "Release") {
          if (buildSettings.includes("SDKROOT")) {
            buildSettings = buildSettings.replace(
              /(SDKROOT\s*=\s*[^;]+;\n)/,
              "$1\t\t\t\tSWIFT_VERSION = 5.0;\n"
            );
          } else if (buildSettings.includes("USE_HERMES")) {
            buildSettings = buildSettings.replace(
              /(USE_HERMES\s*=\s*[^;]+;\n)/,
              "\t\t\t\tSWIFT_VERSION = 5.0;\n$1"
            );
          } else {
            // Fallback: add before closing brace
            buildSettings = buildSettings.replace(
              /(\n\t\t\t\};)/,
              "\n\t\t\t\tSWIFT_VERSION = 5.0;$1"
            );
          }
        }
        return beforeBuildSettings + buildSettings + afterBuildSettings;
      }
      return match;
    }
  );

  // Update Pods file names in build phases for multi-environment setup
  // CocoaPods creates files with names like Pods-{projectName}CommonPods-{targetName}
  // instead of Pods-{projectName} for multi-environment projects
  // Update base target: Pods-{projectName} -> Pods-{projectName}CommonPods-{projectName}
  const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const basePodsPattern = new RegExp(
    `(Target Support Files/Pods-)${escapedProjectName}(/)`,
    "g"
  );
  const basePodsReplacement = `$1${projectName}CommonPods-${projectName}$2`;
  content = content.replace(basePodsPattern, basePodsReplacement);

  // Update environment targets: Pods-{projectName}CommonPods-{projectName} -> Pods-{projectName}CommonPods-{targetName}
  for (const env of envs) {
    const capEnv = getEnvNameForScheme(env);
    const envTargetName = `${projectName}${capEnv}`;
    const envPodsPattern = new RegExp(
      `(Target Support Files/Pods-${escapedProjectName}CommonPods-)${escapedProjectName}(/)`,
      "g"
    );
    // Only replace in paths that are for this environment target's build phases
    // We need to be careful not to replace base target's paths
    // The pattern will match, but we'll replace only in environment-specific contexts
    // Actually, CocoaPods will handle this during pod install, so we just need to
    // update base target references
  }

  // Ensure all PBXFileReference objects for Pods libraries are in Frameworks group
  // This prevents "no parent for object" errors
  // IMPORTANT: Do this AFTER all sections have been updated in content
  // Find Frameworks group (re-find it in case content was modified)
  const frameworksGroupRegex =
    /(\w{24})\s*\/\*\s*Frameworks\s*\*\/\s*=\s*\{[\s\S]*?isa = PBXGroup;[\s\S]*?children\s*=\s*\(([\s\S]*?)\);[\s\S]*?name = Frameworks;/m;
  const frameworksGroupMatch = content.match(frameworksGroupRegex);

  if (frameworksGroupMatch) {
    const frameworksGroupId = frameworksGroupMatch[1];
    const frameworksChildren = frameworksGroupMatch[2];

    // Find all PBXFileReference objects for libPods-*.a files
    // Pattern: ID /* libPods-*.a */ = {isa = PBXFileReference; ... sourceTree = BUILT_PRODUCTS_DIR; ...};
    const fileRefSectionMatch = content.match(
      /\/\* Begin PBXFileReference section \*\/\s*([\s\S]*?)\/\* End PBXFileReference section \*\//m
    );

    if (fileRefSectionMatch) {
      const fileRefSection = fileRefSectionMatch[1];
      // Match any libPods-*.a file reference
      const podsFileRefRegex =
        /(\t\t)(\w{24})(\s*\/\*\s*libPods-[^*]+\*\/\s*=\s*\{[^}]*isa\s*=\s*PBXFileReference[^}]*sourceTree\s*=\s*BUILT_PRODUCTS_DIR[^}]*\};)/g;

      // Reset regex lastIndex to ensure we find all matches
      podsFileRefRegex.lastIndex = 0;

      let podsFileRefMatch;
      const fileRefsToAdd = [];

      while (
        (podsFileRefMatch = podsFileRefRegex.exec(fileRefSection)) !== null
      ) {
        const fileRefId = podsFileRefMatch[2];
        const fullMatch = podsFileRefMatch[0];

        // Extract the file name from the comment
        const fileNameMatch = fullMatch.match(/\/\*\s*(libPods-[^*]+)\s*\*\//);
        const fileName = fileNameMatch
          ? fileNameMatch[1]
          : `libPods-${projectName}.a`;

        // Check if this file reference is already in Frameworks group
        // Use a regex to match the ID with word boundaries to avoid partial matches
        const idRegex = new RegExp(`\\b${fileRefId}\\b`);
        const inFrameworksGroup = idRegex.test(frameworksChildren);

        if (!inFrameworksGroup) {
          fileRefsToAdd.push({ id: fileRefId, name: fileName });
        }
      }

      // Add missing file references to Frameworks group
      if (fileRefsToAdd.length > 0) {
        // Re-find the Frameworks group block to get updated children list
        const updatedFrameworksGroupMatch = content.match(frameworksGroupRegex);
        if (updatedFrameworksGroupMatch) {
          const updatedFrameworksGroupId = updatedFrameworksGroupMatch[1];
          const updatedFrameworksChildren = updatedFrameworksGroupMatch[2];

          const frameworksGroupChildrenRegex = new RegExp(
            `(${updatedFrameworksGroupId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?children\\s*=\\s*\\()([\\s\\S]*?)(\\)[\\s\\S]*?name = Frameworks;)`,
            "m"
          );

          content = content.replace(
            frameworksGroupChildrenRegex,
            (match, prefix, children, suffix) => {
              const trimmedChildren = children.trim();
              const newEntries = fileRefsToAdd
                .map(ref => `\n\t\t\t\t${ref.id} /* ${ref.name} */,`)
                .join("");
              const newChildren =
                trimmedChildren === ""
                  ? `${newEntries}\n\t\t\t`
                  : `${trimmedChildren}${newEntries}\n\t\t\t`;
              return `${prefix}${newChildren}${suffix}`;
            }
          );
        }
      }
    }
  }

  // ABSOLUTE FINAL CHECK: Verify config list IDs one more time before writing
  // Use a more aggressive approach - find and replace directly
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find correct config list ID
    const correctConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!correctConfigListMatch) {
      console.log(
        chalk.yellow(
          `⚠️  Could not find config list for ${targetName} before final write`
        )
      );
      continue;
    }

    const correctConfigListId = correctConfigListMatch[1];

    // Find target ID
    const targetIdMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\*/`
      )
    );

    if (!targetIdMatch) {
      console.log(
        chalk.yellow(
          `⚠️  Could not find target ${targetName} before final write`
        )
      );
      continue;
    }

    const targetId = targetIdMatch[1];

    // Find the target block - get everything from target ID to the closing brace
    // Use a more precise pattern that captures the entire target block
    const targetBlockPattern = new RegExp(
      `(${targetId.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*/\\*\\s*${targetName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
      "m"
    );

    const targetBlockMatch = content.match(targetBlockPattern);
    if (targetBlockMatch) {
      const currentConfigListId = targetBlockMatch[2];

      if (currentConfigListId !== correctConfigListId) {
        console.log(
          chalk.red(
            `❌ ABSOLUTE FINAL FIX: ${targetName} (${targetId}) has wrong config list ID! Expected ${correctConfigListId}, found ${currentConfigListId}. Fixing with aggressive replacement...`
          )
        );

        // AGGRESSIVE FIX: Replace using multiple strategies
        // Strategy 1: Replace the entire line with correct ID and comment
        const aggressivePattern1 = new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "m"
        );

        const beforeFix = content;
        content = content.replace(
          aggressivePattern1,
          `$1${correctConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );

        if (beforeFix === content) {
          console.log(
            chalk.yellow(
              `⚠️  Strategy 1 failed, trying Strategy 2 for ${targetName}...`
            )
          );
          // Strategy 2: Replace just the ID (more aggressive, less precise)
          const aggressivePattern2 = new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]{0,5000}?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list)`,
            "m"
          );
          content = content.replace(
            aggressivePattern2,
            `$1${correctConfigListId}$2 for PBXNativeTarget "${targetName}" */`
          );

          if (beforeFix === content) {
            console.log(
              chalk.yellow(
                `⚠️  Strategy 2 failed, trying Strategy 3 (simple ID replacement) for ${targetName}...`
              )
            );
            // Strategy 3: Simple ID replacement anywhere in target block
            const simplePattern = new RegExp(
              `(${targetId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}`,
              "m"
            );
            content = content.replace(
              simplePattern,
              `$1${correctConfigListId}`
            );
          }
        }

        // Verify the fix worked
        const verifyPattern = new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "m"
        );
        const verifyMatch = content.match(verifyPattern);

        if (verifyMatch && verifyMatch[2] === correctConfigListId) {
          console.log(
            chalk.green(
              `✅ SUCCESS: Fixed config list ID for ${targetName} to ${correctConfigListId}`
            )
          );
        } else {
          console.log(
            chalk.red(
              `❌ FAILED: Could not fix config list ID for ${targetName}. Current: ${
                verifyMatch ? verifyMatch[2] : "not found"
              }, Expected: ${correctConfigListId}`
            )
          );
        }
      } else {
        console.log(
          chalk.green(
            `✅ Verified: ${targetName} already has correct config list ID (${correctConfigListId})`
          )
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Could not find target block pattern for ${targetName} (${targetId})`
        )
      );
    }
  }

  console.log(chalk.green("✅ iOS targets created successfully"));

  // ABSOLUTE FINAL CHECK: One more time before writing - verify and fix staging targets
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find correct config list ID
    const correctConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (correctConfigListMatch) {
      const correctConfigListId = correctConfigListMatch[1];

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

        // Find current config list ID
        const currentMatch = content.match(
          new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "m"
          )
        );

        if (currentMatch && currentMatch[2] !== correctConfigListId) {
          console.log(
            chalk.red(
              `❌ FINAL FIX BEFORE WRITE: ${targetName} has wrong config list ID! Fixing...`
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
            `$1${correctConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
          );
        }
      }
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
  return buildableRefs;
}

module.exports = { cloneBuildConfigBlock, createIosTargetsForEnvs };
