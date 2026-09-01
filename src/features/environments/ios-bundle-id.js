const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

async function updateBaseTargetBundleId({
  selectedEnvs,
  projectPath,
  projectName,
  bundleIdentifier,
  displayName,
}) {
      // CRITICAL: Verify staging config list IDs immediately after createIosTargetsForEnvs
      if (selectedEnvs && selectedEnvs.length > 1) {
        const pbxprojPath = path.join(
          projectPath,
          `ios/${projectName}.xcodeproj/project.pbxproj`
        );
        if (await fs.pathExists(pbxprojPath)) {
          let content = await fs.readFile(pbxprojPath, "utf8");
          for (const env of selectedEnvs) {
            if (env.toLowerCase() === "production") continue;
            const envSuffix = env.toLowerCase();
            const targetName = `${projectName}${
              envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
            }`;

            // Find staging config list
            const stagingConfigListMatch = content.match(
              new RegExp(
                `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                "m"
              )
            );
            if (stagingConfigListMatch) {
              const configIdsInList =
                stagingConfigListMatch[1].match(/\w{24}/g) || [];
              const configIdsFromList =
                stagingConfigListMatch[2].match(/\w{24}/g) || [];

              // Check base config IDs
              const baseConfigListMatch = content.match(
                new RegExp(
                  `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${projectName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                  "m"
                )
              );
              if (baseConfigListMatch) {
                const baseConfigIds =
                  baseConfigListMatch[2].match(/\w{24}/g) || [];
                const overlap = configIdsFromList.filter(id =>
                  baseConfigIds.includes(id)
                );
                if (overlap.length > 0) {
                  console.log(
                    chalk.red(
                      `❌ AFTER createIosTargetsForEnvs: ${targetName} config list uses SAME config IDs as base!`
                    )
                  );
                  console.log(
                    chalk.red(
                      `   Staging config IDs: ${configIdsFromList.join(
                        ", "
                      )}, Base: ${baseConfigIds.join(
                        ", "
                      )}, Overlap: ${overlap.join(", ")}`
                    )
                  );
                } else {
                  console.log(
                    chalk.green(
                      `✅ AFTER createIosTargetsForEnvs: ${targetName} config list correctly uses different config IDs: ${configIdsFromList.join(
                        ", "
                      )}`
                    )
                  );
                }
              }
            }
          }
        }
      }

      // Set bundle identifier for base production target (after environment targets are created)
      // This ensures we only update the base target's configs, not the environment ones
      const pbxprojPath = path.join(
        projectPath,
        `ios/${projectName}.xcodeproj/project.pbxproj`
      );
      if (await fs.pathExists(pbxprojPath)) {
        let pbxprojContent = await fs.readFile(pbxprojPath, "utf8");

        // Find the base target's configuration list ID
        // Base target has config list with name "Build configuration list for PBXNativeTarget \"{projectName}\""
        // IMPORTANT: Must match EXACTLY "{projectName}" without any suffix (like "Staging", "Dev", etc.)
        // Use word boundary to ensure we don't match environment targets like "lepimvarimStaging"
        const escapedProjectName = projectName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        const baseConfigListMatch = pbxprojContent.match(
          new RegExp(
            `(\\w{24})\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "${escapedProjectName}"\\s*\\*\\/`,
            "m"
          )
        );

        if (baseConfigListMatch) {
          const baseConfigListId = baseConfigListMatch[1];

          // CRITICAL: Verify that base target references the correct config list
          const baseTargetMatch = pbxprojContent.match(
            new RegExp(
              `(\\w{24})\\s*/\\*\\s*${escapedProjectName}\\s*\\*/[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "([^"]*)"\\s*\\*/)`,
              "m"
            )
          );
          if (baseTargetMatch) {
            const baseTargetId = baseTargetMatch[1];
            const baseTargetConfigListId = baseTargetMatch[2];
            const baseTargetComment = baseTargetMatch[4];
            if (
              baseTargetConfigListId !== baseConfigListId ||
              baseTargetComment !== projectName
            ) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: Base target references wrong config list! Expected ID: ${baseConfigListId}, Comment: ${projectName}. Found ID: ${baseTargetConfigListId}, Comment: ${baseTargetComment}`
                )
              );
              // According to REFERENCE_FIX_ANALYSIS, we should NOT fix buildConfigurationList in PBXNativeTarget
              // But we need to log this error so the user knows what's wrong
              console.log(
                chalk.yellow(
                  `⚠️  NOTE: According to REFERENCE_FIX_ANALYSIS, we should NOT fix buildConfigurationList in PBXNativeTarget. The base target should have been created with the correct config list ID in createIosTargetsForEnvs.`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ Base target correctly references config list ID: ${baseConfigListId}`
                )
              );
            }
          }

          // Find all config IDs in this config list
          // Use precise pattern: match config list block starting with the specific ID and comment
          const escapedConfigListId = baseConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          const configListBlockMatch = pbxprojContent.match(
            new RegExp(
              `${escapedConfigListId}\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "${escapedProjectName}"\\s*\\*\\/\\s*=\\s*\\{[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
              "m"
            )
          );

          if (configListBlockMatch) {
            const configIds = configListBlockMatch[1].match(/\w{24}/g) || [];

            // CRITICAL: Base target should have its own config IDs
            // These config IDs should be in the base config list with comment "{projectName}"
            // If all config IDs belong to environment targets, it means base target's config list
            // contains wrong config IDs (probably from staging target)
            // In this case, we should still try to update bundle ID in these configs,
            // but log a warning
            const validConfigIds = [];
            const envConfigIds = new Set();

            // First, collect all config IDs from environment targets
            for (const env of selectedEnvs) {
              if (env.toLowerCase() === "production") continue;
                      const envSuffix = env.toLowerCase();
              const targetName = `${projectName}${
                envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
              }`;
              const envConfigListMatch = pbxprojContent.match(
                new RegExp(
                  `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}"\\s*\\*/`
                )
              );
              if (envConfigListMatch) {
                const envConfigListId = envConfigListMatch[1];
                console.log(
                  chalk.cyan(
                    `📸 Found ${targetName} config list ID: ${envConfigListId}`
                  )
                );
                // CRITICAL: Use more precise pattern to match only the config list block
                // Pattern: configListId /* comment */ = { ... buildConfigurations = ( ... ); ... };
                const envConfigListBlockMatch = pbxprojContent.match(
                  new RegExp(
                    `${envConfigListId.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}"\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                    "m"
                  )
                );
                if (envConfigListBlockMatch) {
                  // Extract only config IDs with comments (Debug/Release)
                  const configIdsWithComments = envConfigListBlockMatch[1];
                  // Use exec in a loop to find all matches
                  const configIdRegex =
                    /(\w{24})\s*\/\*\s*(Debug|Release)\s*\*\//g;
                  const envConfigIdsOnly = [];
                  let match;
                  while (
                    (match = configIdRegex.exec(configIdsWithComments)) !== null
                  ) {
                    envConfigIdsOnly.push(match[1]);
                  }
                  if (envConfigIdsOnly.length > 0) {
                    console.log(
                      chalk.cyan(
                        `📸 ${targetName} config list contains config IDs: ${envConfigIdsOnly.join(
                          ", "
                        )}`
                      )
                    );
                    envConfigIdsOnly.forEach(id => envConfigIds.add(id));
                  } else {
                    console.log(
                      chalk.yellow(
                        `⚠️  Could not extract config IDs from ${targetName} config list`
                      )
                    );
                  }
                }
              }
            }

            console.log(
              chalk.cyan(
                `📸 Base config list contains config IDs: ${configIds.join(
                  ", "
                )}`
              )
            );

            // Now check which config IDs from base config list belong to environment targets
            for (const configId of configIds) {
              if (envConfigIds.has(configId)) {
                console.log(
                  chalk.red(
                    `❌ Config ID ${configId} from base config list ALSO belongs to an environment target! This is wrong - base and staging targets should have different config IDs.`
                  )
                );
                // CRITICAL: Base target and environment targets should NOT share config IDs
                // This means base target's config list contains wrong config IDs
                // We should NOT use these config IDs for updating bundle ID, as they will
                // also affect environment targets
              } else {
                validConfigIds.push(configId);
                console.log(
                  chalk.green(
                    `✅ Config ID ${configId} from base config list is unique (not in environment targets)`
                  )
                );
              }
            }

            // If all config IDs belong to environment targets, it's a critical error
            // But we should still try to update bundle ID in these configs as a fallback
            if (validConfigIds.length === 0 && configIds.length > 0) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: All config IDs from base config list belong to environment targets! Base target's config list contains wrong config IDs.`
                )
              );
              console.log(
                chalk.yellow(
                  `⚠️  Using config IDs from base config list anyway as fallback: ${configIds.join(
                    ", "
                  )}`
                )
              );
              // Use config IDs from base config list as fallback
              validConfigIds.push(...configIds);
            }

            // Update PRODUCT_BUNDLE_IDENTIFIER only in validated config blocks
            // These configs belong only to the base target (or we use fallback if all belong to env targets)
            if (validConfigIds.length === 0) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: No valid config IDs found for base target! This should not happen after fallback.`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ Found ${
                    validConfigIds.length
                  } valid config ID(s) for base target: ${validConfigIds.join(
                    ", "
                  )}`
                )
              );
              for (const configId of validConfigIds) {
                // Update bundle identifier
                const configBlockRegex = new RegExp(
                  `(${configId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?PRODUCT_BUNDLE_IDENTIFIER\\s*=\\s*)[^;]+(;)`,
                  "m"
                );

                const beforeReplace = pbxprojContent;
                if (configBlockRegex.test(pbxprojContent)) {
                  pbxprojContent = pbxprojContent.replace(
                    configBlockRegex,
                    `$1${bundleIdentifier}$2`
                  );
                  if (beforeReplace !== pbxprojContent) {
                    console.log(
                      chalk.green(
                        `✅ Updated PRODUCT_BUNDLE_IDENTIFIER to ${bundleIdentifier} in config ${configId}`
                      )
                    );
                  } else {
                    console.log(
                      chalk.yellow(
                        `⚠️  Could not replace PRODUCT_BUNDLE_IDENTIFIER in config ${configId}`
                      )
                    );
                  }
                } else {
                  console.log(
                    chalk.yellow(
                      `⚠️  Could not find PRODUCT_BUNDLE_IDENTIFIER in config ${configId}`
                    )
                  );
                }

                // Update display name for base target (production)
                // Base target should have display name without environment suffix
                const displayNameRegex = new RegExp(
                  `(${configId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?)(INFOPLIST_KEY_CFBundleDisplayName\\s*=\\s*[^;]+;)?`,
                  "m"
                );

                const displayNameMatch = pbxprojContent.match(displayNameRegex);
                if (displayNameMatch) {
                  const beforeDisplayName = pbxprojContent;
                  if (displayNameMatch[2]) {
                    // Replace existing display name
                    pbxprojContent = pbxprojContent.replace(
                      new RegExp(
                        `(${configId.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&"
                        )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?)INFOPLIST_KEY_CFBundleDisplayName\\s*=\\s*[^;]+;`,
                        "m"
                      ),
                      `$1INFOPLIST_KEY_CFBundleDisplayName = "${displayName}";`
                    );
                  } else {
                    // Add display name after INFOPLIST_FILE
                    pbxprojContent = pbxprojContent.replace(
                      new RegExp(
                        `(${configId.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&"
                        )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?INFOPLIST_FILE\\s*=\\s*[^;]+;\\s*)`,
                        "m"
                      ),
                      `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${displayName}";\n`
                    );
                  }
                  if (beforeDisplayName !== pbxprojContent) {
                    console.log(
                      chalk.green(
                        `✅ Updated INFOPLIST_KEY_CFBundleDisplayName to "${displayName}" in config ${configId}`
                      )
                    );
                  }
                }
              }
            }
          }
        }

        // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
        // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to verify or fix
        // staging targets after bundle ID update. The staging targets should already have correct
        // buildConfigurationList IDs from createIosTargetsForEnvs.

        await fs.writeFile(pbxprojPath, pbxprojContent, "utf8");
      }
}

module.exports = { updateBaseTargetBundleId };
