const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { generateXcodeId, getEnvNameForScheme } = require("../../shared/xcode");

async function addFirebaseDependencies(
  projectPath,
  modules = [],
  bundleIdentifier
) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  packageData.dependencies = packageData.dependencies || {};
  const firebaseDeps = {
    "@react-native-firebase/app": "^26.3.0",
  };
  if (modules.includes("analytics")) {
    firebaseDeps["@react-native-firebase/analytics"] = "^26.3.0";
  }
  if (modules.includes("remote-config")) {
    firebaseDeps["@react-native-firebase/remote-config"] = "^26.3.0";
  }
  if (modules.includes("messaging")) {
    firebaseDeps["@react-native-firebase/messaging"] = "^26.3.0";
  }

  packageData.dependencies = { ...packageData.dependencies, ...firebaseDeps };

  // Add analytics debug script only when analytics is selected
  if (modules.includes("analytics")) {
    packageData.scripts = packageData.scripts || {};
    packageData.scripts["android:debug"] =
      packageData.scripts["android:debug"] ||
      `react-native run-android && cd android && adb shell setprop debug.firebase.analytics.app ${
        bundleIdentifier || "com.helloworld"
      } && cd ..`;
  }

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function ensureGoogleServicesPlugin(projectPath) {
  const rootBuildGradle = path.join(projectPath, "android/build.gradle");
  if (await fs.pathExists(rootBuildGradle)) {
    let content = await fs.readFile(rootBuildGradle, "utf8");
    if (!content.includes("com.google.gms:google-services")) {
      content = content.replace(
        /classpath\("org\.jetbrains\.kotlin:kotlin-gradle-plugin"\)\n/,
        match =>
          `${match}        classpath("com.google.gms:google-services:4.4.2")\n`
      );
      await fs.writeFile(rootBuildGradle, content, "utf8");
    }
  }

  const appBuildGradle = path.join(projectPath, "android/app/build.gradle");
  if (await fs.pathExists(appBuildGradle)) {
    let content = await fs.readFile(appBuildGradle, "utf8");
    if (
      !/apply plugin:\s*['"]com\.google\.gms\.google-services['"]/.test(content)
    ) {
      content = content.replace(
        /apply plugin:\s*"com\.facebook\.react"\n/,
        match => `${match}apply plugin: 'com.google.gms.google-services'\n`
      );
      await fs.writeFile(appBuildGradle, content, "utf8");
    }
  }
}

async function enableAndroidPostNotificationsPermission(projectPath) {
  const srcDir = path.join(projectPath, "android/app/src");
  if (!(await fs.pathExists(srcDir))) return;

  const entries = await fs.readdir(srcDir);
  for (const entry of entries) {
    const manifestPath = path.join(srcDir, entry, "AndroidManifest.xml");
    if (!(await fs.pathExists(manifestPath))) continue;

    let content = await fs.readFile(manifestPath, "utf8");
    if (content.includes('android.permission.POST_NOTIFICATIONS')) {
      // Uncomment if commented
      content = content.replace(
        /<!--\s*<uses-permission android:name="android\.permission\.POST_NOTIFICATIONS"\s*\/>\s*-->/g,
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
      );
      await fs.writeFile(manifestPath, content, "utf8");
    }
  }
}

async function enableIosRemoteNotificationsBackgroundMode(projectPath) {
  const iosDir = path.join(projectPath, "ios");
  if (!(await fs.pathExists(iosDir))) return;

  const entries = await fs.readdir(iosDir);
  for (const entry of entries) {
    const candidateDir = path.join(iosDir, entry);
    const stat = await fs.stat(candidateDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    // Update main Info.plist + any env-specific Info.*.plist if present
    const files = await fs.readdir(candidateDir).catch(() => []);
    for (const file of files) {
      if (!/^Info(\..+)?\.plist$/.test(file)) continue;
      const plistPath = path.join(candidateDir, file);
      let content = await fs.readFile(plistPath, "utf8");

      if (content.includes("<key>UIBackgroundModes</key>")) {
        // Ensure remote-notification present
        if (!content.includes("<string>remote-notification</string>")) {
          content = content.replace(
            /<key>UIBackgroundModes<\/key>\s*<array>/,
            `<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>`
          );
        }
      } else {
        // Add UIBackgroundModes before closing </dict>
        content = content.replace(
          /<\/dict>\s*<\/plist>/,
          `\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>`
        );
      }

      await fs.writeFile(plistPath, content, "utf8");
    }
  }
}

async function copyFirebaseGoogleFiles(
  googleFilesByEnv,
  projectPath,
  projectName,
  hasMultipleEnvs = false
) {
  if (!googleFilesByEnv || Object.keys(googleFilesByEnv).length === 0) return;

  for (const [env, files] of Object.entries(googleFilesByEnv)) {
    const lowerEnv = env.toLowerCase();
    const isProduction = lowerEnv === "production";

    if (files.androidJson) {
      if (isProduction) {
        // Production goes to android/app/ (root of app folder)
        const androidTargetPath = path.join(
          projectPath,
          "android/app/google-services.json"
        );
        await fs.copy(files.androidJson, androidTargetPath, {
          overwrite: true,
        });
      } else {
        // Other environments go to android/app/src/<env>/
        const androidTargetDir = path.join(
          projectPath,
          `android/app/src/${lowerEnv}`
        );
        await fs.ensureDir(androidTargetDir);
        await fs.copy(
          files.androidJson,
          path.join(androidTargetDir, "google-services.json"),
          { overwrite: true }
        );
      }
    }

    if (files.iosPlist) {
      if (hasMultipleEnvs) {
        // Multiple environments: go to ios/GoogleServices/<env>/
        const iosTargetDir = path.join(
          projectPath,
          `ios/GoogleServices/${lowerEnv}`
        );
        await fs.ensureDir(iosTargetDir);
        await fs.copy(
          files.iosPlist,
          path.join(iosTargetDir, "GoogleService-Info.plist"),
          {
            overwrite: true,
          }
        );
      } else {
        // Single environment: go directly to ios/{projectName}/
        const iosTargetPath = path.join(
          projectPath,
          `ios/${projectName}/GoogleService-Info.plist`
        );
        await fs.copy(files.iosPlist, iosTargetPath, { overwrite: true });
      }
    }
  }
}

async function updatePodfileForFirebase(projectPath, modules = []) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  if (!content.includes("$RNFirebaseDisableSPM")) {
    content = `$RNFirebaseDisableSPM = true\n${content}`;
  }

  if (
    modules.includes("analytics") &&
    !content.includes("$RNFirebaseAnalyticsWithoutAdIdSupport")
  ) {
    content = `$RNFirebaseAnalyticsWithoutAdIdSupport = true\n${content}`;
  }

  if (!content.includes("FirebaseCore")) {
    const basePods = [
      "  pod 'FirebaseCore', :modular_headers => true",
      "  pod 'GoogleUtilities', :modular_headers => true",
    ];
    if (modules.includes("remote-config")) {
      basePods.push("  pod 'FirebaseRemoteConfig', :modular_headers => true");
      basePods.push("  pod 'FirebaseABTesting', :modular_headers => true");
      basePods.push("  pod 'FirebaseInstallations', :modular_headers => true");
    }

    content = content.replace(
      /use_react_native!\([\s\S]*?\)\n/,
      match => `${match}${basePods.join("\n")}\n`
    );
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAppDelegateForFirebase(projectPath, projectName) {
  const appDelegatePath = path.join(
    projectPath,
    `ios/${projectName}/AppDelegate.swift`
  );
  if (!(await fs.pathExists(appDelegatePath))) return;

  let content = await fs.readFile(appDelegatePath, "utf8");

  if (!content.includes("import Firebase")) {
    content = content.replace(
      /import GoogleMaps\n/,
      match => `${match}import Firebase\n`
    );
  }

  if (!content.includes("FirebaseApp.configure()")) {
    content = content.replace(
      /GMSServices\.provideAPIKey\("<GOOGLE_MAPS_API_KEY>"\)\n\s+/,
      match => `${match}FirebaseApp.configure()\n    `
    );
  }

  await fs.writeFile(appDelegatePath, content, "utf8");
}

async function addGoogleServicesToXcodeProject(
  projectPath,
  projectName,
  selectedEnvs = [],
  hasMultipleEnvs = false
) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) return;

  let content = await fs.readFile(pbxprojPath, "utf8");
  const mainGroupId = "83CBB9F61A601CBA00E9B192"; // Standard main group ID
  const projectGroupId =
    content.match(
      new RegExp(
        `${projectName}\\s*=\\s*\\{[^}]*isa = PBXGroup[^}]*children\\s*=\\s*\\(([A-F0-9]{24})`,
        "m"
      )
    )?.[1] ||
    content
      .match(
        new RegExp(
          `13B07FAE1A68108700A75B9A\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/`,
          "m"
        )
      )?.[0]
      ?.match(/[A-F0-9]{24}/)?.[0];

  if (hasMultipleEnvs) {
    // Multiple environments: add GoogleServices folder
    if (content.includes("path = GoogleServices")) {
      return; // Already added
    }

    // Generate IDs
    const googleServicesId = generateXcodeId();

    // Find mainGroup and add GoogleServices to children
    const mainGroupRegex = new RegExp(
      `(${mainGroupId.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*=\\s*\\{[^}]*children\\s*=\\s*\\()`,
      "m"
    );
    if (mainGroupRegex.test(content)) {
      content = content.replace(
        mainGroupRegex,
        `$1${googleServicesId} /* GoogleServices */,\n\t\t\t\t`
      );
    }

    // Find all targets to create exception sets for each
    const allEnvs = [...selectedEnvs];
    if (!allEnvs.some(env => env.toLowerCase() === "production")) {
      allEnvs.push("production");
    }

    // Find all targets (base + environment targets)
    // Look for PBXNativeTarget blocks - they start with ID /* name */ = { and contain isa = PBXNativeTarget;
    const targetMatches = [];
    const nativeTargetSectionMatch = content.match(
      /\/\* Begin PBXNativeTarget section \*\/\s*([\s\S]*?)\/\* End PBXNativeTarget section \*\//m
    );
    if (nativeTargetSectionMatch) {
      const nativeTargetSection = nativeTargetSectionMatch[1];
      // Match: ID /* name */ = { ... isa = PBXNativeTarget; ... name = name;
      const targetBlockRegex =
        /(\w{24})\s*\/\*\s*([^*]+)\s*\*\/\s*=\s*\{[\s\S]*?isa\s*=\s*PBXNativeTarget;[\s\S]*?name\s*=\s*([^;]+);/g;
      let targetMatch;
      while (
        (targetMatch = targetBlockRegex.exec(nativeTargetSection)) !== null
      ) {
        const targetId = targetMatch[1];
        const targetName = targetMatch[3].trim();
        targetMatches.push({ id: targetId, name: targetName });
      }
    }

    // Create exception sets for each target
    const exceptionSetIds = [];
    for (const target of targetMatches) {
      // Determine which environment this target belongs to
      let targetEnv = null;
      const lowerTargetName = target.name.toLowerCase();
      const lowerProjectName = projectName.toLowerCase();

      // Check if it's the base production target
      if (lowerTargetName === lowerProjectName) {
        targetEnv = "production";
      } else {
        // Check environment targets
        for (const env of allEnvs) {
          const envName = getEnvNameForScheme(env);
          if (
            lowerTargetName.includes(env.toLowerCase()) ||
            lowerTargetName.includes(envName.toLowerCase())
          ) {
            targetEnv = env.toLowerCase();
            break;
          }
        }
      }

      if (!targetEnv) continue; // Skip if we can't determine the environment

      // Create exception set ID
      const exceptionSetId = generateXcodeId();
      exceptionSetIds.push(exceptionSetId);

      // Each target excludes its OWN environment file (as in lepimvarim)
      const excludedFile = `"${targetEnv}/GoogleService-Info.plist"`;

      // Add PBXFileSystemSynchronizedBuildFileExceptionSet section if it doesn't exist
      if (
        !content.includes(
          "PBXFileSystemSynchronizedBuildFileExceptionSet section"
        )
      ) {
        const exceptionSetSection = `/* Begin PBXFileSystemSynchronizedBuildFileExceptionSet section */\n\t\t${exceptionSetId} /* PBXFileSystemSynchronizedBuildFileExceptionSet */ = {\n\t\t\tisa = PBXFileSystemSynchronizedBuildFileExceptionSet;\n\t\t\tmembershipExceptions = (\n\t\t\t\t${excludedFile},\n\t\t\t);\n\t\t\ttarget = ${target.id} /* ${target.name} */;\n\t\t};\n/* End PBXFileSystemSynchronizedBuildFileExceptionSet section */\n\n`;

        // Insert before PBXFileSystemSynchronizedRootGroup section
        const rootGroupSectionRegex =
          /\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\//;
        if (rootGroupSectionRegex.test(content)) {
          content = content.replace(
            rootGroupSectionRegex,
            exceptionSetSection +
              "/* Begin PBXFileSystemSynchronizedRootGroup section */"
          );
        } else {
          // Insert before PBXFrameworksBuildPhase section
          const frameworksSectionRegex =
            /\/\* Begin PBXFrameworksBuildPhase section \*\//;
          if (frameworksSectionRegex.test(content)) {
            content = content.replace(
              frameworksSectionRegex,
              exceptionSetSection +
                "/* Begin PBXFrameworksBuildPhase section */"
            );
          }
        }
      } else {
        // Section exists, add our exception set before the end marker
        const exceptionSetBlock = `\t\t${exceptionSetId} /* PBXFileSystemSynchronizedBuildFileExceptionSet */ = {\n\t\t\tisa = PBXFileSystemSynchronizedBuildFileExceptionSet;\n\t\t\tmembershipExceptions = (\n\t\t\t\t${excludedFile},\n\t\t\t);\n\t\t\ttarget = ${target.id} /* ${target.name} */;\n\t\t};\n`;
        content = content.replace(
          /(\/\* End PBXFileSystemSynchronizedBuildFileExceptionSet section \*\/)/,
          `${exceptionSetBlock}$1`
        );
      }
    }

    // Add PBXFileSystemSynchronizedRootGroup section if it doesn't exist
    const exceptionsList = exceptionSetIds
      .map(id => `${id} /* PBXFileSystemSynchronizedBuildFileExceptionSet */`)
      .join(", ");
    if (!content.includes("PBXFileSystemSynchronizedRootGroup section")) {
      const synchronizedRootGroupSection = `/* Begin PBXFileSystemSynchronizedRootGroup section */\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (${exceptionsList}); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };\n/* End PBXFileSystemSynchronizedRootGroup section */\n\n`;

      // Insert before PBXFrameworksBuildPhase section
      const frameworksSectionRegex =
        /\/\* Begin PBXFrameworksBuildPhase section \*\//;
      if (frameworksSectionRegex.test(content)) {
        content = content.replace(
          frameworksSectionRegex,
          synchronizedRootGroupSection +
            "/* Begin PBXFrameworksBuildPhase section */"
        );
      }
    } else {
      // Section exists, update exceptions list
      const rootGroupRegex = new RegExp(
        `(${googleServicesId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\/\\*\\s*GoogleServices\\s*\\*\\/\\s*=\\s*\\{[^}]*exceptions\\s*=\\s*\\()([^)]*)(\\)[^}]*\\};)`,
        "m"
      );
      if (rootGroupRegex.test(content)) {
        // Get existing exception IDs
        const existingExceptions = rootGroupRegex.exec(content);
        const existingExceptionIds =
          existingExceptions[2].match(/\w{24}/g) || [];

        // Combine existing and new exception IDs, avoiding duplicates
        const allExceptionIds = [
          ...new Set([...existingExceptionIds, ...exceptionSetIds]),
        ];
        const allExceptionsList = allExceptionIds
          .map(
            id => `${id} /* PBXFileSystemSynchronizedBuildFileExceptionSet */`
          )
          .join(", ");

        content = content.replace(rootGroupRegex, `$1${allExceptionsList}$3`);
      } else {
        // Root group doesn't exist yet, add it
        const existingSectionRegex =
          /(\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\/)/;
        content = content.replace(
          existingSectionRegex,
          `$1\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (${exceptionsList}); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };`
        );
      }
    }

    // Note: In lepimvarim, GoogleServices is added to mainGroup but NOT to fileSystemSynchronizedGroups in targets
    // PBXFileSystemSynchronizedRootGroup with exceptions is sufficient - Xcode automatically handles file visibility
    // We don't need to add fileSystemSynchronizedGroups to each target
  } else {
    // Single environment: add GoogleService-Info.plist file directly to project group
    // Check if file already exists (by name, not by reference)
    const fileExistsRegex = new RegExp(
      `GoogleService-Info\\.plist.*path = "${projectName}/GoogleService-Info\\.plist"`,
      "m"
    );
    if (fileExistsRegex.test(content)) {
      return; // Already added
    }

    const fileId = generateXcodeId();
    const buildFileId = generateXcodeId();

    // Find project group by looking for the group that contains the project name
    // The group ID is typically 13B07FAE1A68108700A75B9A but name is replaced
    const projectGroupMatch = content.match(
      new RegExp(
        `([A-F0-9]{24})\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/\\s*=\\s*\\{[^}]*isa = PBXGroup[^}]*children\\s*=\\s*\\(`,
        "m"
      )
    );

    if (projectGroupMatch) {
      const projectGroupId = projectGroupMatch[1];
      const projectGroupRegex = new RegExp(
        `(${projectGroupId}\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/\\s*=\\s*\\{[^}]*children\\s*=\\s*\\()`,
        "m"
      );
      if (projectGroupRegex.test(content)) {
        content = content.replace(
          projectGroupRegex,
          `$1${fileId} /* GoogleService-Info.plist */,\n\t\t\t\t`
        );
      }
    }

    // Add PBXFileReference
    const fileReferenceSectionRegex =
      /(\/\* Begin PBXFileReference section \*\/)/;
    if (fileReferenceSectionRegex.test(content)) {
      content = content.replace(
        fileReferenceSectionRegex,
        `$1\n\t\t${fileId} /* GoogleService-Info.plist */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; name = "GoogleService-Info.plist"; path = "${projectName}/GoogleService-Info.plist"; sourceTree = "<group>"; };`
      );
    }

    // Add PBXBuildFile
    const buildFileSectionRegex = /(\/\* Begin PBXBuildFile section \*\/)/;
    if (buildFileSectionRegex.test(content)) {
      content = content.replace(
        buildFileSectionRegex,
        `$1\n\t\t${buildFileId} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${fileId} /* GoogleService-Info.plist */; };`
      );
    }

    // Add to Resources build phase - find by target name pattern
    const resourcesPhaseRegex = new RegExp(
      `(13B07F8E1A680F5B00A75B9A\\s*/\\*\\s*Resources\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?files\\s*=\\s*\\([\\s\\S]*?)(\\t\\t\\t\\);\\s*runOnlyForDeploymentPostprocessing)`,
      "m"
    );
    if (resourcesPhaseRegex.test(content)) {
      content = content.replace(
        resourcesPhaseRegex,
        `$1\t\t\t\t${buildFileId} /* GoogleService-Info.plist in Resources */,\n\t\t\t$2`
      );
    }
  }

  // NOTE: In the reference project, there were NO fixes to buildConfigurationList in PBXNativeTarget blocks
  // The fix was only in XCBuildConfiguration comments (renamed from "lepimvarimStg Debug" to "Debug")
  // and in XCConfigurationList comments (renamed from "lepimvarimStg Debug" to "Debug")
  // So we don't need to fix buildConfigurationList here - it should already be correct from createIosTargetsForEnvs

  // CRITICAL: Verify that staging config list IDs are still correct after Google Services changes
  if (hasMultipleEnvs && selectedEnvs.length > 0) {
    for (const env of selectedEnvs) {
      if (env.toLowerCase() === "production") continue;
      const envSuffix = env.toLowerCase();
      const targetName = `${projectName}${
        envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
      }`;

      // Find staging target and its config list
      const stagingTargetMatch = content.match(
        new RegExp(
          `(\\w{24})\\s*/\\*\\s*${targetName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\s*\\*/[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})`,
          "m"
        )
      );
      if (stagingTargetMatch) {
        const stagingConfigListId = stagingTargetMatch[2];
        // Find config IDs in this config list
        const stagingConfigListBlock = content.match(
          new RegExp(
            `${stagingConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
            "m"
          )
        );
        if (stagingConfigListBlock) {
          const configIdsInList =
            stagingConfigListBlock[1].match(/\w{24}/g) || [];
          // Check if these are base config IDs (should be different!)
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
            const baseConfigIds = baseConfigListMatch[2].match(/\w{24}/g) || [];
            const overlap = configIdsInList.filter(id =>
              baseConfigIds.includes(id)
            );
            if (overlap.length > 0) {
              console.log(
                chalk.red(
                  `❌ AFTER GOOGLE SERVICES: ${targetName} config list uses SAME config IDs as base! Config IDs: ${configIdsInList.join(
                    ", "
                  )}, Base: ${baseConfigIds.join(
                    ", "
                  )}, Overlap: ${overlap.join(", ")}`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ AFTER GOOGLE SERVICES: ${targetName} config list correctly uses different config IDs: ${configIdsInList.join(
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

  await fs.writeFile(pbxprojPath, content, "utf8");
  if (hasMultipleEnvs) {
    console.log(
      chalk.green(`  ✅ Added GoogleServices folder to Xcode project`)
    );
  } else {
    console.log(
      chalk.green(`  ✅ Added GoogleService-Info.plist to Xcode project`)
    );
  }
}


module.exports = {
  addFirebaseDependencies,
  ensureGoogleServicesPlugin,
  copyFirebaseGoogleFiles,
  updatePodfileForFirebase,
  updateAppDelegateForFirebase,
  addGoogleServicesToXcodeProject,
};
