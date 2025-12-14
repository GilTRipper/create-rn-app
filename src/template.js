const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const execa = require("execa");
const crypto = require("crypto");
const { replaceInFile } = require("./utils");

const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

// Get proper environment name for schemes/targets (staging -> Stg, development -> Development, etc.)
function getEnvNameForScheme(env) {
  const lower = env.toLowerCase();
  if (lower === "staging") {
    return "Stg";
  }
  return capitalize(env);
}

async function ensureManifestPackage(manifestPath, bundleIdentifier) {
  if (!(await fs.pathExists(manifestPath))) {
    console.log(
      chalk.yellow(`⚠️  AndroidManifest.xml does not exist: ${manifestPath}`)
    );
    return;
  }

  let manifestContent = await fs.readFile(manifestPath, "utf8");

  // Check if package attribute already exists
  if (manifestContent.includes(`package="${bundleIdentifier}"`)) {
    // Already has correct package
    return;
  }

  // Check if package attribute exists but with different value
  const packageRegex = /package="[^"]+"/;
  if (packageRegex.test(manifestContent)) {
    // Replace existing package
    manifestContent = manifestContent.replace(
      packageRegex,
      `package="${bundleIdentifier}"`
    );
  } else {
    // Add package attribute to manifest tag
    manifestContent = manifestContent.replace(
      /<manifest\s+xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"([^>]*)>/,
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundleIdentifier}"$1>`
    );
  }

  await fs.writeFile(manifestPath, manifestContent, "utf8");
}

function getGoogleFilesByEnv(firebaseConfig) {
  if (!firebaseConfig || !firebaseConfig.filesByEnv) {
    return {};
  }
  return firebaseConfig.filesByEnv;
}

async function copyFirebaseLibModules(projectPath, modules = []) {
  if (!modules || modules.length === 0) {
    return;
  }

  const sourceLibPath = path.join(__dirname, "firebase-lib-modules");

  // Check if source directory exists
  if (!(await fs.pathExists(sourceLibPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Firebase lib modules directory not found: ${sourceLibPath}. Skipping Firebase lib modules copy.`
      )
    );
    return;
  }

  const targetLibPath = path.join(projectPath, "src/lib");
  await fs.ensureDir(targetLibPath);

  // Copy analytics if selected
  if (modules.includes("analytics")) {
    const sourceAnalyticsPath = path.join(sourceLibPath, "analytics");
    const targetAnalyticsPath = path.join(targetLibPath, "analytics");

    if (await fs.pathExists(sourceAnalyticsPath)) {
      await fs.copy(sourceAnalyticsPath, targetAnalyticsPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied analytics lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Analytics source directory not found: ${sourceAnalyticsPath}`
        )
      );
    }
  }

  // Copy remote-config if selected
  if (modules.includes("remote-config")) {
    const sourceRemoteConfigPath = path.join(sourceLibPath, "remote-config");
    const targetRemoteConfigPath = path.join(targetLibPath, "remote-config");

    if (await fs.pathExists(sourceRemoteConfigPath)) {
      await fs.copy(sourceRemoteConfigPath, targetRemoteConfigPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied remote-config lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Remote Config source directory not found: ${sourceRemoteConfigPath}`
        )
      );
    }
  }
}

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
    "@react-native-firebase/app": "^23.5.0",
  };
  if (modules.includes("analytics")) {
    firebaseDeps["@react-native-firebase/analytics"] = "^23.5.0";
  }
  if (modules.includes("remote-config")) {
    firebaseDeps["@react-native-firebase/remote-config"] = "^23.5.0";
  }
  if (modules.includes("messaging")) {
    firebaseDeps["@react-native-firebase/messaging"] = "^23.5.0";
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

  if (!content.includes("FirebaseCore")) {
    const basePods = [
      "  pod 'FirebaseCore', :modular_headers => true",
      "  pod 'GoogleUtilities', :modular_headers => true",
    ];
    if (modules.includes("analytics")) {
      basePods.push("  $RNFirebaseAnalyticsWithoutAdIdSupport = true");
    }
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

async function removeMapsDependencies(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  if (packageData.dependencies) {
    delete packageData.dependencies["react-native-maps"];
    delete packageData.dependencies["react-native-maps-directions"];
  }

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function updatePodfileForMaps(projectPath, enableGoogleMaps) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps pod configuration
    // Match the comment and pod declaration, including the rn_maps_path line
    // Replace with newline to ensure proper spacing before post_install
    content = content.replace(
      /\s*# Google Maps для react-native-maps\s*\n\s*rn_maps_path = '\.\.\/node_modules\/react-native-maps'\s*\n\s*pod 'react-native-maps\/Google', :path => rn_maps_path\s*\n?/,
      "\n"
    );
    // Ensure post_install always starts on a new line with proper indentation
    // Normalize any spacing issues: ensure ) is followed by newline, then empty line, then post_install
    content = content.replace(
      /(\s*\))\s*\n?\s*post_install\s+do/,
      "$1\n\n  post_install do"
    );
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAppDelegateForMaps(
  projectPath,
  projectName,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const appDelegatePath = path.join(
    projectPath,
    `ios/${projectName}/AppDelegate.swift`
  );
  if (!(await fs.pathExists(appDelegatePath))) return;

  let content = await fs.readFile(appDelegatePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps import
    content = content.replace(/import GoogleMaps\n/, "");
    // Remove Google Maps initialization (with comment)
    content = content.replace(
      /\s*\/\/ Initialize Google Maps\s*\n\s*GMSServices\.provideAPIKey\("[^"]*"\)\s*\n\s*/,
      ""
    );
  } else {
    // Ensure Google Maps import exists
    if (!content.includes("import GoogleMaps")) {
      // Add import after other imports
      content = content.replace(
        /(import\s+\w+\n)+/,
        match => `${match}import GoogleMaps\n`
      );
    }
    // Replace API key if provided, otherwise leave placeholder
    if (googleMapsApiKey) {
      content = content.replace(
        /GMSServices\.provideAPIKey\("<GOOGLE_MAPS_API_KEY>"\)/,
        `GMSServices.provideAPIKey("${googleMapsApiKey}")`
      );
    }
    // If no API key, ensure placeholder exists
    if (!content.includes("GMSServices.provideAPIKey")) {
      // Add initialization after didFinishLaunchingWithOptions opening
      content = content.replace(
        /(didFinishLaunchingWithOptions[^:]*:\s*Bool\s*\{)\s*/,
        `$1\n    // Initialize Google Maps\n    GMSServices.provideAPIKey("<GOOGLE_MAPS_API_KEY>")\n    `
      );
    }
  }

  await fs.writeFile(appDelegatePath, content, "utf8");
}

async function updateAndroidManifestForMaps(
  projectPath,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const manifestPath = path.join(
    projectPath,
    "android/app/src/main/AndroidManifest.xml"
  );
  if (!(await fs.pathExists(manifestPath))) return;

  let content = await fs.readFile(manifestPath, "utf8");

  if (!enableGoogleMaps || !googleMapsApiKey) {
    // Ensure the Google Maps API key meta-data is commented out
    // First check if there's an uncommented meta-data tag (any format)
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/>/;

    if (uncommentedPattern.test(content)) {
      // Comment it out
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<!-- <meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="\${GOOGLE_MAPS_API_KEY}" /> -->`
      );
    }
    // If already commented (in any format), leave it as is - no action needed
  } else {
    // Uncomment and set the API key
    const commentedSingleLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/> -->/;
    const commentedMultiLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/> -->/;
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/>/;

    if (commentedMultiLinePattern.test(content)) {
      // Uncomment multi-line format and set API key
      content = content.replace(
        commentedMultiLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (commentedSingleLinePattern.test(content)) {
      // Uncomment single-line format and set API key
      content = content.replace(
        commentedSingleLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (uncommentedPattern.test(content)) {
      // Replace existing API key
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    }
  }

  await fs.writeFile(manifestPath, content, "utf8");
}

// Generate a 24-character hex ID for Xcode project objects
function generateXcodeId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  )
    .join("")
    .toUpperCase();
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

    // Add PBXFileSystemSynchronizedRootGroup section if it doesn't exist
    if (!content.includes("PBXFileSystemSynchronizedRootGroup section")) {
      const synchronizedRootGroupSection = `/* Begin PBXFileSystemSynchronizedRootGroup section */\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };\n/* End PBXFileSystemSynchronizedRootGroup section */\n\n`;

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
      // Section exists, just add our entry
      const existingSectionRegex =
        /(\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\/)/;
      content = content.replace(
        existingSectionRegex,
        `$1\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };`
      );
    }

    // Add to fileSystemSynchronizedGroups for all PBXNativeTarget sections
    // Process in reverse order to avoid position shifts

    // First, update existing fileSystemSynchronizedGroups
    content = content.replace(
      /(fileSystemSynchronizedGroups\s*=\s*\()([\s\S]*?)(\))/g,
      (match, prefix, groups, suffix) => {
        if (groups.includes("GoogleServices")) {
          return match; // Already has GoogleServices
        }
        const trimmedGroups = groups.trim();
        if (trimmedGroups === "") {
          return `${prefix}${googleServicesId} /* GoogleServices */,\n\t\t\t${suffix}`;
        } else {
          return `${prefix}${trimmedGroups},\n\t\t\t\t${googleServicesId} /* GoogleServices */,\n\t\t\t${suffix}`;
        }
      }
    );

    // Then, add fileSystemSynchronizedGroups to targets that don't have it
    // Process from end to beginning to avoid position shifts
    const productTypeRegex = /productType\s*=\s*"[^"]+";/g;
    const matches = [];
    let m;
    while ((m = productTypeRegex.exec(content)) !== null) {
      matches.push({ index: m.index, length: m[0].length, fullMatch: m[0] });
    }

    // Process in reverse order
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const productTypePos = match.index;
      const productTypeEnd = productTypePos + match.length;

      // Find the target block boundaries
      const beforeTarget = content.substring(0, productTypePos);
      const targetStart = beforeTarget.lastIndexOf("isa = PBXNativeTarget;");
      const afterProductType = content.substring(productTypeEnd);
      const targetEnd = afterProductType.indexOf("\t\t};");

      if (targetStart >= 0 && targetEnd >= 0) {
        const targetBlock = content.substring(
          targetStart,
          productTypeEnd + targetEnd
        );

        // Check if this target already has fileSystemSynchronizedGroups
        if (!targetBlock.includes("fileSystemSynchronizedGroups")) {
          // Add fileSystemSynchronizedGroups after productType
          content =
            content.substring(0, productTypeEnd) +
            `\n\t\t\tfileSystemSynchronizedGroups = (\n\t\t\t\t${googleServicesId} /* GoogleServices */,\n\t\t\t);` +
            content.substring(productTypeEnd);
        }
      }
    }
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

async function copyAndroidEnvSources(
  selectedEnvs,
  projectPath,
  bundleIdentifier
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const mainSrcPath = path.join(projectPath, "android/app/src/main");
  if (!(await fs.pathExists(mainSrcPath))) {
    console.log(
      chalk.yellow(`⚠️  Main source path does not exist: ${mainSrcPath}`)
    );
    return;
  }

  for (const env of selectedEnvs) {
    // Skip production - it doesn't need a source directory, only flavor in build.gradle
    if (env.toLowerCase() === "production") {
      continue;
    }

    const envDir = path.join(projectPath, `android/app/src/${env}`);
    await fs.ensureDir(envDir);

    // Copy all files except .kt files
    // Walk through the directory and copy files individually
    const copyRecursive = async (src, dest) => {
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        await fs.ensureDir(dest);
        const entries = await fs.readdir(src);
        for (const entry of entries) {
          // Skip java directory (contains .kt files)
          if (entry === "java") {
            continue;
          }
          await copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
      } else {
        // Skip .kt files
        if (!src.endsWith(".kt")) {
          await fs.copy(src, dest, { overwrite: true });
        }
      }
    };

    await copyRecursive(mainSrcPath, envDir);

    // Also copy fonts from main/assets/fonts to env/assets/fonts if they exist
    const mainFontsDir = path.join(mainSrcPath, "assets", "fonts");
    const envFontsDir = path.join(envDir, "assets", "fonts");
    if (await fs.pathExists(mainFontsDir)) {
      await fs.ensureDir(envFontsDir);
      const fontFiles = await fs.readdir(mainFontsDir);
      for (const fontFile of fontFiles) {
        const sourceFont = path.join(mainFontsDir, fontFile);
        const targetFont = path.join(envFontsDir, fontFile);
        const stat = await fs.stat(sourceFont);
        if (stat.isFile()) {
          await fs.copy(sourceFont, targetFont, { overwrite: true });
        }
      }
    }

    // Note: We don't add package attribute to AndroidManifest.xml as it causes errors
  }
}

function buildEnvConfigFilesBlock(selectedEnvs) {
  // Always include production for Android (even if not selected)
  const envsForConfig = [...selectedEnvs];
  if (!envsForConfig.some(env => env.toLowerCase() === "production")) {
    envsForConfig.push("production");
  }

  const allLines = [];
  envsForConfig.forEach((env, index) => {
    const lower = env.toLowerCase();
    const isLast = index === envsForConfig.length - 1;
    allLines.push(`    ${lower}debug: ".env.${lower}",`);
    // Last release line should not have comma
    if (isLast) {
      allLines.push(`    ${lower}release: ".env.${lower}"`);
    } else {
      allLines.push(`    ${lower}release: ".env.${lower}",`);
    }
  });
  return `project.ext.envConfigFiles = [\n${allLines.join("\n")}\n]`;
}

function buildProductFlavorsBlock(selectedEnvs, bundleIdentifier) {
  // Always include production for Android (even if not selected)
  const envsForFlavors = [...selectedEnvs];
  if (!envsForFlavors.some(env => env.toLowerCase() === "production")) {
    envsForFlavors.push("production");
  }

  const flavors = envsForFlavors
    .map(env => {
      const lower = env.toLowerCase();
      return `        ${lower} {\n            dimension "default"\n            applicationId "${bundleIdentifier}"\n            resValue "string", "build_config_package", "${bundleIdentifier}"\n        }`;
    })
    .join("\n");

  return `    flavorDimensions "default"\n    productFlavors {\n${flavors}\n    }`;
}

async function updateAndroidBuildGradle(
  selectedEnvs,
  projectPath,
  bundleIdentifier
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const buildGradlePath = path.join(projectPath, "android/app/build.gradle");
  if (!(await fs.pathExists(buildGradlePath))) {
    console.log(
      chalk.yellow(`⚠️  build.gradle does not exist: ${buildGradlePath}`)
    );
    return;
  }

  let content = await fs.readFile(buildGradlePath, "utf8");

  // Add or update envConfigFiles block
  const envBlock = buildEnvConfigFilesBlock(selectedEnvs);
  // Match the entire envConfigFiles block including newlines
  const envRegex = /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/m;
  if (envRegex.test(content)) {
    // Update existing block - replace the entire block
    content = content.replace(envRegex, envBlock);
  } else {
    // Add new block - try to find apply from dotenv.gradle first
    const dotenvRegex =
      /(apply from: project\(':react-native-config'\)\.projectDir\.getPath\(\) \+ "\/dotenv\.gradle")/;
    if (dotenvRegex.test(content)) {
      // Add after the dotenv.gradle line with proper newline
      content = content.replace(dotenvRegex, `$1\n${envBlock}`);
    } else {
      // Try to find any apply from dotenv
      const dotenvSimpleRegex = /(apply from: .*dotenv\.gradle)/;
      if (dotenvSimpleRegex.test(content)) {
        content = content.replace(dotenvSimpleRegex, `$1\n${envBlock}`);
      } else {
        // Add at the top of the file after any apply statements
        const applyRegex = /(apply plugin:.*\n)/;
        if (applyRegex.test(content)) {
          content = content.replace(applyRegex, `$1${envBlock}\n`);
        } else {
          // Add at the beginning
          content = `${envBlock}\n${content}`;
        }
      }
    }
  }

  // Add or update productFlavors block
  const flavorsBlock = buildProductFlavorsBlock(selectedEnvs, bundleIdentifier);
  const productFlavorsRegex =
    /flavorDimensions[\s\S]*?productFlavors\s*\{[\s\S]*?\}/m;
  if (productFlavorsRegex.test(content)) {
    // Update existing block
    content = content.replace(productFlavorsRegex, flavorsBlock);
  } else {
    // Add new block - find android block and add after defaultConfig
    const androidBlockRegex =
      /(android\s*\{[\s\S]*?defaultConfig\s*\{[\s\S]*?\}\s*)/m;
    if (androidBlockRegex.test(content)) {
      content = content.replace(
        androidBlockRegex,
        match => `${match}\n    ${flavorsBlock}\n`
      );
    } else {
      // Try to find android block without defaultConfig
      const androidSimpleRegex = /(android\s*\{)/m;
      if (androidSimpleRegex.test(content)) {
        content = content.replace(
          androidSimpleRegex,
          match => `${match}\n    ${flavorsBlock}\n`
        );
      } else {
        console.log(
          chalk.yellow(`⚠️  Could not find android block in build.gradle`)
        );
      }
    }
  }

  // Validate that envConfigFiles block is properly formatted
  const validationRegex = /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/m;
  const match = content.match(validationRegex);
  if (match) {
    const block = match[0];
    // Check for common issues
    if (block.includes(']"') || block.match(/\]\s*"/)) {
      console.log(
        chalk.yellow(
          "⚠️  Warning: Found potential quote issue in envConfigFiles block"
        )
      );
    }
    // Ensure block ends with ] and not ]"
    if (block.trim().endsWith(']"')) {
      content = content.replace(block, block.replace(/\]\s*"$/, "]"));
    }
  }

  await fs.writeFile(buildGradlePath, content, "utf8");
}

function buildPreActionBlock(buildableReference, env, projectName) {
  const escapedEnv = env.toLowerCase();
  const projectDirVar = "${PROJECT_DIR}";
  return `  <PreActions>
      <ExecutionAction
         ActionType = "Xcode.IDEStandardExecutionActionsCore.ExecutionActionType.ShellScriptAction">
         <ActionContent
            title = "Run Script"
            scriptText = "cp &quot;${projectDirVar}/../.env.${escapedEnv}&quot; &quot;${projectDirVar}/../.env&quot;&#10;">
            <EnvironmentBuildable>
${buildableReference}
            </EnvironmentBuildable>
         </ActionContent>
      </ExecutionAction>
   </PreActions>
`;
}

function injectPreActionIntoSection(schemeContent, tag, preAction) {
  // Remove existing PreActions within the section
  const sectionRegex = new RegExp(
    `<${tag}[^>]*>[\\s\\S]*?<\\/` + tag + `>`,
    "m"
  );
  const match = schemeContent.match(sectionRegex);
  if (!match) return schemeContent;

  let section = match[0];
  section = section.replace(/<PreActions>[\s\S]*?<\/PreActions>/g, "");
  // Insert preAction right after the opening tag
  section = section.replace(new RegExp(`(<${tag}[^>]*>)`), `$1\n${preAction}`);

  return schemeContent.replace(sectionRegex, section);
}

async function renameDefaultIosScheme(projectPath, projectName) {
  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  // Find HelloWorld scheme or any scheme that needs renaming
  const helloWorldScheme = schemeFiles.find(
    file =>
      file.includes("HelloWorld") || file.toLowerCase().includes("helloworld")
  );

  if (!helloWorldScheme) {
    // Check if there's a scheme that doesn't match projectName
    const baseScheme = schemeFiles[0];
    if (baseScheme && !baseScheme.includes(projectName)) {
      // Rename it to projectName
      const oldPath = path.join(schemesDir, baseScheme);
      const newPath = path.join(schemesDir, `${projectName}.xcscheme`);
      if (oldPath !== newPath) {
        await fs.move(oldPath, newPath, { overwrite: true });

        // Update scheme content
        let schemeContent = await fs.readFile(newPath, "utf8");
        schemeContent = schemeContent
          .replace(/HelloWorld/g, projectName)
          .replace(/helloworld/g, projectName.toLowerCase());
        await fs.writeFile(newPath, schemeContent, "utf8");
        console.log(
          chalk.green(`  ✅ Renamed scheme to ${projectName}.xcscheme`)
        );
      }
    }
    return;
  }

  const oldPath = path.join(schemesDir, helloWorldScheme);
  const newPath = path.join(schemesDir, `${projectName}.xcscheme`);

  if (oldPath !== newPath) {
    await fs.move(oldPath, newPath, { overwrite: true });

    // Update scheme content
    let schemeContent = await fs.readFile(newPath, "utf8");
    schemeContent = schemeContent
      .replace(/HelloWorld/g, projectName)
      .replace(/helloworld/g, projectName.toLowerCase());
    await fs.writeFile(newPath, schemeContent, "utf8");
    console.log(
      chalk.green(
        `  ✅ Renamed scheme from ${helloWorldScheme} to ${projectName}.xcscheme`
      )
    );
  }
}

async function createIosEnvSchemes(
  selectedEnvs,
  projectPath,
  projectName,
  buildableRefs = {},
  googleFilesByEnv = {}
) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const envsForSchemes = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );

  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  const workspaceSchemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcworkspace/xcshareddata`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  const baseSchemePath = path.join(schemesDir, schemeFiles[0]);
  let baseSchemeContent = await fs.readFile(baseSchemePath, "utf8");
  baseSchemeContent = baseSchemeContent
    .replace(/HelloWorld/g, projectName)
    .replace(/helloworld/g, projectName.toLowerCase());
  const buildableMatch = baseSchemeContent.match(
    /<BuildableReference[\s\S]*?<\/BuildableReference>/
  );
  const baseBuildableReference =
    buildableRefs.base?.ref || (buildableMatch ? buildableMatch[0] : null);

  // Ensure base scheme name matches project
  const desiredBaseScheme = `${projectName}.xcscheme`;
  if (path.basename(baseSchemePath) !== desiredBaseScheme) {
    await fs.move(baseSchemePath, path.join(schemesDir, desiredBaseScheme), {
      overwrite: true,
    });
  }

  if (!baseBuildableReference) return;

  // Create Info.plist copies for each env scheme (excluding production)
  // Info.plist files are created in ios/ directory, not in projectName subdirectory
  const baseInfoPlist = path.join(projectPath, `ios/${projectName}/Info.plist`);

  // First, ensure base Info.plist has fonts (used by production)
  // Get font files from assets/fonts and update base Info.plist BEFORE copying
  const fontsDir = path.join(projectPath, "assets", "fonts");
  let fontFiles = [];
  if (await fs.pathExists(fontsDir)) {
    fontFiles = (await fs.readdir(fontsDir)).filter(file =>
      /\.(ttf|otf|ttc|woff|woff2)$/i.test(file)
    );
    if (fontFiles.length > 0 && (await fs.pathExists(baseInfoPlist))) {
      // Update base Info.plist (production uses this) before copying
      await addFontsToInfoPlistForPath(baseInfoPlist, fontFiles);
    }
  }

  // Now copy the updated base Info.plist for each environment
  const envInfoPlists = [];
  for (const env of envsForSchemes) {
    const envPlistFileName = `${projectName} ${env}-Info.plist`;
    const envPlistPath = path.join(
      projectPath,
      `ios/${projectName}/${envPlistFileName}`
    );
    if (await fs.pathExists(baseInfoPlist)) {
      await fs.copy(baseInfoPlist, envPlistPath, { overwrite: true });
      envInfoPlists.push({
        env,
        path: envPlistPath,
        fileName: envPlistFileName,
      });
    }
  }

  // Update all environment Info.plist files with fonts (they should already have them from copy, but ensure)
  if (fontFiles.length > 0) {
    for (const { path: envPlistPath } of envInfoPlists) {
      await addFontsToInfoPlistForPath(envPlistPath, fontFiles);
    }
  }

  // Add Info.plist files to Xcode project
  await addInfoPlistsToXcodeProject(
    projectPath,
    projectName,
    envInfoPlists,
    pbxprojPath
  );

  // Always add pre-actions to production/base scheme (.env.production)
  console.log(chalk.blue(`  Updating production scheme: ${desiredBaseScheme}`));
  const prodPreAction = buildPreActionBlock(
    baseBuildableReference,
    "production",
    projectName
  );
  let prodSchemeContent = baseSchemeContent.replace(
    /<Scheme[^>]*>/,
    `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "BuildAction",
    prodPreAction
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "LaunchAction",
    prodPreAction
  );
  await fs.writeFile(
    path.join(schemesDir, desiredBaseScheme),
    prodSchemeContent,
    "utf8"
  );
  console.log(chalk.green(`  ✅ Production scheme updated`));

  for (const env of envsForSchemes) {
    const schemeName = `${projectName}${getEnvNameForScheme(env)}`;
    console.log(
      chalk.blue(`  Creating scheme for ${env}: ${schemeName}.xcscheme`)
    );
    const envBuildableRef =
      buildableRefs.envs?.[env]?.ref || baseBuildableReference;
    const targetPath = path.join(schemesDir, `${schemeName}.xcscheme`);
    let schemeContent = baseSchemeContent.replace(
      /<Scheme[^>]*>/,
      `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
    );

    // Inject pre-actions into BuildAction (replace existing PreActions)
    const preAction = buildPreActionBlock(envBuildableRef, env, projectName);
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "BuildAction",
      preAction
    );
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "LaunchAction",
      preAction
    );

    await fs.writeFile(targetPath, schemeContent, "utf8");
    console.log(chalk.green(`  ✅ Scheme ${schemeName}.xcscheme created`));

    if (workspaceSchemesDir) {
      await fs.ensureDir(workspaceSchemesDir);
    }
  }

  console.log(
    chalk.green(
      `✅ Created ${envsForSchemes.length} environment scheme(s) + production scheme`
    )
  );
}

async function updatePodfileForEnvs(selectedEnvs, projectPath, projectName) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  const envsForTargets = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );
  const targets = envsForTargets.map(
    env => `${projectName}${getEnvNameForScheme(env)}`
  );

  // Add prod target when multiple environments are created
  const prodTargetBlock = `  target '${projectName}' do
  end
`;

  const targetBlocks =
    targets
      .map(
        target => `  target '${target}' do
  end
`
      )
      .join("\n") + prodTargetBlock;

  const podfileContent = `def node_require(script)
  # Resolve script with node to allow for hoisting
  require Pod::Executable.execute_command('node', ['-p',
    "require.resolve(
     '\#{script}',
     {paths: [process.argv[1]]},
    )", __dir__]).strip
end

# Use it to require both react-native's and this package's scripts:
node_require('react-native/scripts/react_native_pods.rb')
node_require('react-native-permissions/scripts/setup.rb')

platform :ios, 15.6
prepare_react_native_project!

setup_permissions([
  'Camera',
  'LocationAccuracy',
  'LocationAlways',
  'LocationWhenInUse',
  'MediaLibrary',
  'PhotoLibrary',
  'PhotoLibraryAddOnly'
])

linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with \#{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
end

abstract_target '${projectName}CommonPods' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "\#{Pod::Config.instance.installation_root}/.."
  )

  pod 'FirebaseCore', :modular_headers => true
  pod 'GoogleUtilities', :modular_headers => true
  
  # Google Maps для react-native-maps
  rn_maps_path = '../node_modules/react-native-maps'
  pod 'react-native-maps/Google', :path => rn_maps_path
  
  pod 'FirebaseRemoteConfig', :modular_headers => true
  pod 'FirebaseABTesting', :modular_headers => true
  pod 'FirebaseInstallations', :modular_headers => true

${targetBlocks}
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5.0'
      end
    end

    installer.pods_project.build_configurations.each do |config|
      config.build_settings['SWIFT_VERSION'] = '5.0'
    end
  end
end
`;

  await fs.writeFile(podfilePath, podfileContent, "utf8");
}

function genId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase()
  ).join("");
}

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

async function createIosTargetsForEnvs(selectedEnvs, projectPath, projectName) {
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
              if (block.match(/^\s*Swift\s*=/m)) {
                console.log(
                  chalk.yellow(
                    `⚠️  Found invalid "Swift" field in extracted block ${id}, will be removed during cleanup`
                  )
                );
              }
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
              if (block.match(/^\s*Swift\s*=/m)) {
                console.log(
                  chalk.yellow(
                    `⚠️  Found invalid "Swift" field in fallback-extracted block ${id}, will be removed during cleanup`
                  )
                );
              }
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
      console.log(
        chalk.yellow(
          `⚠️  Config block ${id} has mismatched braces: ${openBraces} open, ${closeBraces} close`
        )
      );
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
              console.log(
                chalk.yellow(
                  `⚠️  Removing invalid "Swift" field (without VERSION) in block ${id}`
                )
              );
              continue;
            }
            if (fieldNames.has(fieldName)) {
              // Skip duplicate field - keep only the first occurrence
              console.log(
                chalk.yellow(
                  `⚠️  Removing duplicate field in block ${id}: ${fieldName}`
                )
              );
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
    let debugCfg = cloneBuildConfigBlock(
      debugBase,
      newDebugConfigId,
      `${targetName} Debug`,
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    debugCfg = debugCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    let releaseCfg = cloneBuildConfigBlock(
      releaseBase,
      newReleaseConfigId,
      `${targetName} Release`,
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    releaseCfg = releaseCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    // Preserve original formatting - blocks should already have correct tabs from cloneBuildConfigBlock
    // XCBuildConfiguration blocks end with "};" on a new line
    // Validate and fix block structure after replacements

    // Ensure blocks end properly - they should end with "};" and newline
    const debugCfgTrimmed = debugCfg.trim();
    if (!debugCfgTrimmed.endsWith("};")) {
      console.log(
        chalk.yellow(`⚠️  Debug config block doesn't end with "};", fixing...`)
      );
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
      console.log(
        chalk.yellow(
          `⚠️  Release config block doesn't end with "};", fixing...`
        )
      );
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

    let newConfigList = `\t\t${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${newDebugConfigId} /* ${targetName} Debug */,\n\t\t\t\t${newReleaseConfigId} /* ${targetName} Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};`;

    // Ensure config list ends properly
    newConfigList = newConfigList.trim();
    if (!newConfigList.endsWith(";")) {
      newConfigList += ";";
    }
    newConfigList += "\n";

    // Insert before the end marker - find last complete block and insert after it
    // XCConfigurationList blocks are multiline and end with "};"
    const lastConfigListBlockMatch = configListSection.match(
      /(\t\t\w{24}[^}]*\};\n)(?=\/\* End XCConfigurationList section \*\/)/
    );
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

    // Native target - replace specific fields to avoid double replacement
    // First replace IDs
    let newTarget = targetBlock
      .replace(new RegExp(`${baseTargetId}`, "g"), newTargetId)
      .replace(new RegExp(`${baseProductRefId}`, "g"), newProductRefId)
      .replace(new RegExp(`${baseConfigListId}`, "g"), newConfigListId);

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
    // Replace buildPhases if we have the block, but be careful with multiline matching
    if (buildPhasesBlock) {
      // Find the buildPhases line and replace everything until the closing );
      const buildPhasesRegex = /buildPhases = \([\s\S]*?\);/m;
      if (buildPhasesRegex.test(newTarget)) {
        newTarget = newTarget.replace(buildPhasesRegex, buildPhasesBlock);
      }
    }
    // Preserve original formatting from targetBlock
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
  content = content.replace(nativeSectionRe, nativeSection);
  content = content.replace(configListSectionRe, configListSection);
  content = content.replace(configSectionRe, configSection);

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

  console.log(chalk.green("✅ iOS targets created successfully"));
  await fs.writeFile(pbxprojPath, content, "utf8");
  return buildableRefs;
}
async function copySplashScreenImages(
  splashScreenDir,
  projectPath,
  projectName
) {
  const placeholderPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAn8B9qX+hwAAAABJRU5ErkJggg==";
  const placeholderBuffer = Buffer.from(placeholderPngBase64, "base64");

  const spinner = ora("Copying splash screen images...").start();

  try {
    // If no directory provided, write blank placeholders for both platforms
    if (!splashScreenDir) {
      // iOS blank assets
      const iosSplashPath = path.join(
        projectPath,
        `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
      );
      await fs.ensureDir(iosSplashPath);
      const iosTargets = [
        "SplashScreen.png",
        "SplashScreen@2x.png",
        "SplashScreen@3x.png",
      ];
      for (const file of iosTargets) {
        await fs.writeFile(path.join(iosSplashPath, file), placeholderBuffer);
      }

      // Android blank assets (all densities + base)
      const androidResPath = path.join(projectPath, "android/app/src/main/res");
      const androidTargets = [
        "drawable",
        "drawable-hdpi",
        "drawable-mdpi",
        "drawable-xhdpi",
        "drawable-xxhdpi",
        "drawable-xxxhdpi",
      ];
      for (const dir of androidTargets) {
        const densityPath = path.join(androidResPath, dir);
        await fs.ensureDir(densityPath);
        await fs.writeFile(
          path.join(densityPath, "splash.png"),
          placeholderBuffer
        );
      }

      spinner.succeed("Using blank default splash screens");
      return;
    }

    // Check if directory exists
    if (!(await fs.pathExists(splashScreenDir))) {
      spinner.warn("Splash screen directory does not exist, skipping...");
      return;
    }

    const iosSourceDir = path.join(splashScreenDir, "ios");
    const androidSourceDir = path.join(splashScreenDir, "android");

    const hasIosDir = await fs.pathExists(iosSourceDir);
    const hasAndroidDir = await fs.pathExists(androidSourceDir);

    // If ios/ and android/ subdirectories exist, use them directly (like appicon.co structure)
    if (hasIosDir || hasAndroidDir) {
      // Copy iOS images from ios/ subdirectory
      if (hasIosDir) {
        const iosSplashPath = path.join(
          projectPath,
          `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
        );

        if (await fs.pathExists(iosSplashPath)) {
          const iosFiles = await fs.readdir(iosSourceDir);
          const iosImageFiles = [];

          // Collect all image files
          for (const file of iosFiles) {
            const filePath = path.join(iosSourceDir, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
              iosImageFiles.push(file);
            }
          }

          // Determine which file is which scale based on filename
          let ios1x = null;
          let ios2x = null;
          let ios3x = null;

          for (const file of iosImageFiles) {
            const lowerFile = file.toLowerCase();
            if (/@3x|3x/i.test(file)) {
              ios3x = file;
            } else if (/@2x|2x/i.test(file)) {
              ios2x = file;
            } else {
              // Default to 1x if no scale indicator
              if (!ios1x) ios1x = file;
            }
          }

          // If we only have one file, use it for all scales
          if (iosImageFiles.length === 1) {
            ios1x = ios2x = ios3x = iosImageFiles[0];
          }

          // Copy and rename files to standard names (always use .png for iOS)
          if (ios1x) {
            await fs.copy(
              path.join(iosSourceDir, ios1x),
              path.join(iosSplashPath, "SplashScreen.png")
            );
          }
          if (ios2x) {
            await fs.copy(
              path.join(iosSourceDir, ios2x),
              path.join(iosSplashPath, "SplashScreen@2x.png")
            );
          }
          if (ios3x) {
            await fs.copy(
              path.join(iosSourceDir, ios3x),
              path.join(iosSplashPath, "SplashScreen@3x.png")
            );
          }
        }
      }

      // Copy Android images from android/ subdirectory
      if (hasAndroidDir) {
        const androidResPath = path.join(
          projectPath,
          "android/app/src/main/res"
        );

        if (await fs.pathExists(androidResPath)) {
          // Look for drawable-* directories in android source
          const androidFiles = await fs.readdir(androidSourceDir);
          for (const item of androidFiles) {
            const itemPath = path.join(androidSourceDir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory() && item.startsWith("drawable-")) {
              // Copy all files from drawable-* directory and rename to splash.png
              const densityPath = path.join(androidResPath, item);
              await fs.ensureDir(densityPath);

              const densityFiles = await fs.readdir(itemPath);
              // Find first image file (or use all if multiple)
              for (const file of densityFiles) {
                const filePath = path.join(itemPath, file);
                const fileStat = await fs.stat(filePath);
                if (fileStat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
                  // Always rename to splash.png (Android expects PNG format)
                  await fs.copy(filePath, path.join(densityPath, "splash.png"));
                  // Only copy first file per density
                  break;
                }
              }
            } else if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(item)) {
              // If there are files directly in android/ directory, try to map them
              // This is a fallback for flat structure
              const androidBase = item;
              const densities = [
                "drawable-hdpi",
                "drawable-mdpi",
                "drawable-xhdpi",
                "drawable-xxhdpi",
                "drawable-xxxhdpi",
              ];

              for (const density of densities) {
                const densityPath = path.join(androidResPath, density);
                await fs.ensureDir(densityPath);
                await fs.copy(itemPath, path.join(densityPath, "splash.png"));
              }
            }
          }
        }
      }

      spinner.succeed("Splash screen images copied");
      return;
    }

    // Fallback: old logic - search for files by name patterns
    const files = await fs.readdir(splashScreenDir);
    const imageFiles = [];
    for (const file of files) {
      const filePath = path.join(splashScreenDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) {
      spinner.warn(
        "No image files found in splash screen directory, skipping..."
      );
      return;
    }

    // Find splash screen images
    // Look for files with patterns like: splash.png, splash@2x.png, splash@3x.png
    // or any files with @2x, @3x in name, or splash-hdpi.png, splash-mdpi.png, etc.
    const findImage = pattern => {
      return imageFiles.find(file => new RegExp(pattern, "i").test(file));
    };

    // For iOS: look for files with @2x, @3x in name, or splash.png, or use first file for all
    let ios1x = null;
    let ios2x = null;
    let ios3x = null;

    // First, try to find files by scale indicators
    for (const file of imageFiles) {
      if (/@3x|3x/i.test(file)) {
        ios3x = file;
      } else if (/@2x|2x/i.test(file)) {
        ios2x = file;
      } else if (!ios1x && /@1x|^splash/i.test(file)) {
        ios1x = file;
      }
    }

    // Fallback: use splash.png patterns
    if (!ios1x) {
      ios1x =
        findImage("^splash(@1x)?\\.(png|jpg|jpeg)$") ||
        findImage("^splash\\.(png|jpg|jpeg)$");
    }
    if (!ios2x) {
      ios2x = findImage("^splash@2x\\.(png|jpg|jpeg)$") || ios1x;
    }
    if (!ios3x) {
      ios3x = findImage("^splash@3x\\.(png|jpg|jpeg)$") || ios1x;
    }

    // If still no files found, use first available file for all scales
    if (!ios1x && imageFiles.length > 0) {
      ios1x = ios2x = ios3x = imageFiles[0];
    }

    // For Android: look for density-specific files or use splash.png for all
    const androidBase = findImage("^splash\\.png$");
    const androidHdpi = findImage("^splash-hdpi\\.png$") || androidBase;
    const androidMdpi = findImage("^splash-mdpi\\.png$") || androidBase;
    const androidXhdpi = findImage("^splash-xhdpi\\.png$") || androidBase;
    const androidXxhdpi = findImage("^splash-xxhdpi\\.png$") || androidBase;
    const androidXxxhdpi = findImage("^splash-xxxhdpi\\.png$") || androidBase;

    // Copy iOS images
    const iosSplashPath = path.join(
      projectPath,
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
    );

    if (await fs.pathExists(iosSplashPath)) {
      if (ios1x) {
        await fs.copy(
          path.join(splashScreenDir, ios1x),
          path.join(iosSplashPath, "SplashScreen.png")
        );
      }
      if (ios2x) {
        await fs.copy(
          path.join(splashScreenDir, ios2x),
          path.join(iosSplashPath, "SplashScreen@2x.png")
        );
      }
      if (ios3x) {
        await fs.copy(
          path.join(splashScreenDir, ios3x),
          path.join(iosSplashPath, "SplashScreen@3x.png")
        );
      }
    }

    // Copy Android images
    const androidResPath = path.join(projectPath, "android/app/src/main/res");

    if (await fs.pathExists(androidResPath)) {
      const densities = [
        { name: "drawable-hdpi", file: androidHdpi },
        { name: "drawable-mdpi", file: androidMdpi },
        { name: "drawable-xhdpi", file: androidXhdpi },
        { name: "drawable-xxhdpi", file: androidXxhdpi },
        { name: "drawable-xxxhdpi", file: androidXxxhdpi },
      ];

      for (const density of densities) {
        if (density.file) {
          const densityPath = path.join(androidResPath, density.name);
          await fs.ensureDir(densityPath);
          await fs.copy(
            path.join(splashScreenDir, density.file),
            path.join(densityPath, "splash.png")
          );
        }
      }
    }

    spinner.succeed("Splash screen images copied");
  } catch (error) {
    spinner.fail("Failed to copy splash screen images");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

async function copyAppIcons(appIconDir, projectPath, projectName) {
  if (!appIconDir) {
    return; // Use default icons if no directory provided
  }

  const spinner = ora("Copying app icons...").start();

  try {
    // Check if directory exists
    if (!(await fs.pathExists(appIconDir))) {
      spinner.warn("App icon directory does not exist, skipping...");
      return;
    }

    const androidSourceDir = path.join(appIconDir, "android");
    const iosSourceDir = path.join(
      appIconDir,
      "Assets.xcassets",
      "AppIcon.appiconset"
    );

    const hasAndroidDir = await fs.pathExists(androidSourceDir);
    const hasIosDir = await fs.pathExists(iosSourceDir);

    // Copy Android icons from android/ subdirectory
    if (hasAndroidDir) {
      const androidResPath = path.join(projectPath, "android/app/src/main/res");

      if (await fs.pathExists(androidResPath)) {
        const densities = [
          "mipmap-hdpi",
          "mipmap-mdpi",
          "mipmap-xhdpi",
          "mipmap-xxhdpi",
          "mipmap-xxxhdpi",
        ];

        for (const density of densities) {
          const sourceDensityPath = path.join(androidSourceDir, density);
          const targetDensityPath = path.join(androidResPath, density);

          if (await fs.pathExists(sourceDensityPath)) {
            await fs.ensureDir(targetDensityPath);

            // Copy ic_launcher.png and ic_launcher_round.png
            const iconFiles = ["ic_launcher.png", "ic_launcher_round.png"];
            for (const iconFile of iconFiles) {
              const sourceFile = path.join(sourceDensityPath, iconFile);
              const targetFile = path.join(targetDensityPath, iconFile);

              if (await fs.pathExists(sourceFile)) {
                await fs.copy(sourceFile, targetFile);
              }
            }
          }
        }
      }
    }

    // Copy iOS icons from Assets.xcassets/AppIcon.appiconset/
    if (hasIosDir) {
      const iosTargetPath = path.join(
        projectPath,
        `ios/${projectName}/Images.xcassets/AppIcon.appiconset`
      );

      if (await fs.pathExists(path.dirname(iosTargetPath))) {
        await fs.ensureDir(iosTargetPath);

        // Copy all PNG files from source
        const sourceFiles = await fs.readdir(iosSourceDir);
        for (const file of sourceFiles) {
          const sourceFilePath = path.join(iosSourceDir, file);
          const stat = await fs.stat(sourceFilePath);

          if (stat.isFile() && /\.(png|PNG)$/.test(file)) {
            const targetFilePath = path.join(iosTargetPath, file);
            await fs.copy(sourceFilePath, targetFilePath);
          }
        }

        // Copy Contents.json if it exists
        const contentsJsonSource = path.join(iosSourceDir, "Contents.json");
        const contentsJsonTarget = path.join(iosTargetPath, "Contents.json");
        if (await fs.pathExists(contentsJsonSource)) {
          await fs.copy(contentsJsonSource, contentsJsonTarget);
        }
      }
    }

    // Fallback: if structure is flat, try to find icons in root
    if (!hasAndroidDir && !hasIosDir) {
      const files = await fs.readdir(appIconDir);
      const imageFiles = files.filter(file => /\.(png|PNG)$/.test(file));

      if (imageFiles.length > 0) {
        spinner.warn(
          "Found icon files but expected android/ and Assets.xcassets/AppIcon.appiconset/ structure. Skipping..."
        );
      }
    }

    spinner.succeed("App icons copied");
  } catch (error) {
    spinner.fail("Failed to copy app icons");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

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

function generateUuid() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  ).toUpperCase();
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
            if (lines[i].trim() === "}") {
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

async function createEnvFiles(selectedEnvs, projectPath) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  // Always create production .env file
  const allEnvs = [...selectedEnvs];
  if (!allEnvs.some(env => env.toLowerCase() === "production")) {
    allEnvs.push("production");
  }

  for (const env of allEnvs) {
    // Create .env files in the root of the project (not in android/ios folders)
    const envFile = path.join(projectPath, `.env.${env.toLowerCase()}`);
    // Create empty .env file if it doesn't exist
    if (!(await fs.pathExists(envFile))) {
      await fs.writeFile(
        envFile,
        `# ${env.toUpperCase()} environment variables\n`,
        "utf8"
      );
      console.log(chalk.green(`  ✅ Created ${path.basename(envFile)}`));
    }
  }
}

async function addScriptsToPackageJson(
  selectedEnvs,
  projectPath,
  projectName,
  bundleIdentifier
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  let packageJson = await fs.readFile(packageJsonPath, "utf8");
  let packageData;
  try {
    packageData = JSON.parse(packageJson);
  } catch (error) {
    console.log(
      chalk.yellow(`⚠️  Could not parse package.json: ${error.message}`)
    );
    return;
  }

  if (!packageData.scripts) {
    packageData.scripts = {};
  }

  // Always include production for Android
  const allEnvs = [...selectedEnvs];
  if (!allEnvs.some(env => env.toLowerCase() === "production")) {
    allEnvs.push("production");
  }

  const lowerProjectName = projectName.toLowerCase();
  const capProjectName =
    projectName.charAt(0).toUpperCase() + projectName.slice(1);

  // Add Android scripts
  for (const env of allEnvs) {
    const lowerEnv = env.toLowerCase();
    const capEnv = env.charAt(0).toUpperCase() + env.slice(1);
    // Use short name for staging (stg)
    const scriptEnv = lowerEnv === "staging" ? "stg" : lowerEnv;

    // Debug scripts
    if (lowerEnv === "production") {
      packageData.scripts[
        `android:prod`
      ] = `react-native run-android --mode=productiondebug --appId=${bundleIdentifier}`;
      packageData.scripts[
        `android:prod-release`
      ] = `react-native run-android --mode=productionrelease`;
      packageData.scripts[
        `android:build-prod`
      ] = `cd android && ./gradlew app:assembleProductionRelease && cd ..`;
      packageData.scripts[
        `android:bundle`
      ] = `cd android && ./gradlew clean && ./gradlew bundleProductionRelease && cd ..`;
    } else {
      packageData.scripts[
        `android:${scriptEnv}`
      ] = `react-native run-android --mode=${lowerEnv}debug --appId=${bundleIdentifier}.debug`;
      packageData.scripts[
        `android:${scriptEnv}-release`
      ] = `react-native run-android --mode=${lowerEnv}release`;
      packageData.scripts[
        `android:build-${scriptEnv}`
      ] = `cd android && ./gradlew app:assemble${capEnv}Release && cd ..`;
    }
  }

  // Add general build script if development exists
  if (allEnvs.some(env => env.toLowerCase() === "development")) {
    packageData.scripts[
      `android:build`
    ] = `cd android && ./gradlew app:assembleDevelopmentRelease && cd ..`;
  }

  // Add iOS scripts
  const envsForIos = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );
  for (const env of envsForIos) {
    const lowerEnv = env.toLowerCase();
    // Use short name for staging (stg) in script name
    const scriptEnv = lowerEnv === "staging" ? "stg" : lowerEnv;
    const schemeName = `${projectName}${getEnvNameForScheme(env)}`;
    packageData.scripts[
      `ios:${scriptEnv}`
    ] = `react-native run-ios --scheme '${schemeName}'`;
  }

  // Always add production iOS script
  packageData.scripts[
    `ios:prod`
  ] = `react-native run-ios --scheme '${projectName}'`;

  // Write updated package.json
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function createApp(config) {
  const {
    projectName,
    projectPath,
    bundleIdentifier,
    displayName,
    packageManager,
    skipInstall,
    skipGit,
    skipPods,
    autoYes,
    splashScreenDir,
    appIconDir,
    fontsDir,
    envSetupSelectedEnvs = [],
    firebase = {},
    maps = {},
  } = config;

  const templatePath = path.join(__dirname, "../template");
  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const firebaseFilesByEnv = getGoogleFilesByEnv(firebase?.googleFiles);
  const mapsEnabled = maps?.enabled || false;
  const mapsProvider = maps?.provider || null;
  const googleMapsApiKey = maps?.googleMapsApiKey || null;
  const enableGoogleMaps = mapsProvider === "google-maps";

  // Step 1: Copy template
  const copySpinner = ora("Copying template files...").start();
  try {
    await fs.ensureDir(projectPath);
    await fs.copy(templatePath, projectPath, {
      filter: src => {
        // Skip node_modules, build folders, etc.
        const relativePath = path.relative(templatePath, src);
        const normalizedPath = relativePath.replace(/\\/g, "/");

        // Skip node_modules, .git, Pods
        if (
          normalizedPath.includes("node_modules") ||
          normalizedPath.includes(".git") ||
          normalizedPath.includes("Pods")
        ) {
          return false;
        }

        // Skip build directories (but allow build.gradle files)
        // Pattern: /build/ or /build at end (directory), but not build.gradle (file)
        const buildDirPattern = /\/build(\/|$)/;
        if (buildDirPattern.test(normalizedPath)) {
          // This is a build directory, skip it
          return false;
        }

        // Allow build.gradle files
        if (normalizedPath.endsWith("build.gradle")) {
          return true;
        }

        return true;
      },
    });

    // Rename _gitignore to .gitignore
    const gitignorePath = path.join(projectPath, "_gitignore");
    if (await fs.pathExists(gitignorePath)) {
      await fs.move(gitignorePath, path.join(projectPath, ".gitignore"));
    }

    copySpinner.succeed("Template files copied");
  } catch (error) {
    copySpinner.fail("Failed to copy template files");
    throw error;
  }

  // Step 2: Replace placeholders
  const replaceSpinner = ora("Replacing placeholders...").start();
  try {
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

    // Force iOS bundle identifier to the provided value
    const pbxprojPath = path.join(
      projectPath,
      `ios/${projectName}.xcodeproj/project.pbxproj`
    );
    if (await fs.pathExists(pbxprojPath)) {
      let pbxprojContent = await fs.readFile(pbxprojPath, "utf8");
      pbxprojContent = pbxprojContent.replace(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${bundleIdentifier};`
      );
      await fs.writeFile(pbxprojPath, pbxprojContent, "utf8");
    }

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

    // Step 2.3.5: Copy fonts BEFORE creating environments (so base Info.plist is updated)
    await copyFonts(fontsDir, projectPath, projectName);

    // Environment-specific setup (Android/iOS)
    // Create environments even if only one is selected
    const selectedEnvs =
      envSetupSelectedEnvs && envSetupSelectedEnvs.length >= 1
        ? envSetupSelectedEnvs
        : [];
    if (selectedEnvs.length > 0) {
      await copyAndroidEnvSources(selectedEnvs, projectPath, bundleIdentifier);
      await updateAndroidBuildGradle(
        selectedEnvs,
        projectPath,
        bundleIdentifier
      );
      await updatePodfileForEnvs(selectedEnvs, projectPath, projectName);
      const buildableRefs = await createIosTargetsForEnvs(
        selectedEnvs,
        projectPath,
        projectName
      );
      await createIosEnvSchemes(
        selectedEnvs,
        projectPath,
        projectName,
        buildableRefs || {},
        firebaseEnabled ? firebaseFilesByEnv : {}
      );

      // Create .env files for all environments
      await createEnvFiles(selectedEnvs, projectPath);

      // Add scripts to package.json
      await addScriptsToPackageJson(
        selectedEnvs,
        projectPath,
        projectName,
        bundleIdentifier
      );
    }

    if (firebaseEnabled) {
      await addFirebaseDependencies(
        projectPath,
        firebaseModules,
        bundleIdentifier
      );
      await ensureGoogleServicesPlugin(projectPath);
      // Check if we have multiple environments in Firebase config
      const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
      const hasMultipleEnvs = envsInFirebase.length > 1;
      await copyFirebaseGoogleFiles(
        firebaseFilesByEnv,
        projectPath,
        projectName,
        hasMultipleEnvs
      );
      await updatePodfileForFirebase(projectPath, firebaseModules);
      await updateAppDelegateForFirebase(projectPath, projectName);

      // Copy Firebase lib modules (analytics, remote-config) if selected
      const libModules = firebaseModules.filter(
        module => module === "analytics" || module === "remote-config"
      );
      if (libModules.length > 0) {
        await copyFirebaseLibModules(projectPath, libModules);
      }
    }

    // Add GoogleServices folder/file to Xcode project (after all targets are created)
    if (firebaseEnabled) {
      const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
      const hasMultipleEnvs = envsInFirebase.length > 1;
      await addGoogleServicesToXcodeProject(
        projectPath,
        projectName,
        selectedEnvs,
        hasMultipleEnvs
      );
    }

    // Maps setup
    if (!mapsEnabled) {
      // Remove react-native-maps dependencies if maps are not enabled
      await removeMapsDependencies(projectPath);
      // Also remove Google Maps code if maps are not enabled
      await updatePodfileForMaps(projectPath, false);
      await updateAppDelegateForMaps(projectPath, projectName, false, null);
      await updateAndroidManifestForMaps(projectPath, false, null);
    } else {
      // Update Podfile for Google Maps (only affects iOS)
      await updatePodfileForMaps(projectPath, enableGoogleMaps);
      // Update AppDelegate for Google Maps (only affects iOS)
      await updateAppDelegateForMaps(
        projectPath,
        projectName,
        enableGoogleMaps,
        googleMapsApiKey
      );
      // Update AndroidManifest for Google Maps
      // On Android, Google Maps is always required for react-native-maps
      // So we only comment if Google Maps is explicitly disabled AND no API key provided
      await updateAndroidManifestForMaps(
        projectPath,
        enableGoogleMaps,
        googleMapsApiKey
      );
    }

    // Rename default iOS scheme if no environments were selected
    if (!selectedEnvs || selectedEnvs.length === 0) {
      await renameDefaultIosScheme(projectPath, projectName);
    }

    replaceSpinner.succeed("Placeholders replaced");
  } catch (error) {
    replaceSpinner.fail("Failed to replace placeholders");
    throw error;
  }

  // Step 2.4: Copy splash screen images if provided
  await copySplashScreenImages(splashScreenDir, projectPath, projectName);

  // Step 2.6: Copy app icons if provided
  await copyAppIcons(appIconDir, projectPath, projectName);

  // Step 3: Install dependencies
  let dependenciesInstalled = false;

  if (!skipInstall) {
    console.log(
      chalk.cyan(`\n📦 Installing dependencies with ${packageManager}...\n`)
    );

    try {
      const installArgs =
        packageManager === "npm"
          ? ["install", "--legacy-peer-deps"]
          : ["install"];

      await execa(packageManager, installArgs, {
        cwd: projectPath,
        stdio: "inherit",
        shell: true,
      });
      console.log(chalk.green("\n✅ Dependencies installed successfully!\n"));
      dependenciesInstalled = true;
    } catch (error) {
      console.log(chalk.red("\n❌ Failed to install dependencies"));

      if (error.message) {
        console.log(chalk.dim(`Error: ${error.message}`));
      }

      console.log(
        chalk.yellow(`\nYou can install dependencies manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  ${packageManager} install\n`));
    }

    // Install pods for iOS only if dependencies were installed successfully
    if (dependenciesInstalled && process.platform === "darwin" && !skipPods) {
      let shouldInstallPods = autoYes;

      if (!autoYes) {
        const inquirer = require("inquirer");
        const { installPods } = await inquirer.prompt([
          {
            type: "confirm",
            name: "installPods",
            message: "Install iOS CocoaPods now?",
            default: true,
          },
        ]);
        shouldInstallPods = installPods;
      }

      if (shouldInstallPods) {
        console.log(chalk.cyan("\n📦 Installing iOS CocoaPods...\n"));
        try {
          await execa("pod", ["install"], {
            cwd: path.join(projectPath, "ios"),
            stdio: "inherit",
            shell: true,
          });
          console.log(
            chalk.green("\n✅ iOS CocoaPods installed successfully!\n")
          );
        } catch (error) {
          console.log(chalk.red("\n❌ Failed to install CocoaPods"));
          if (error.message) {
            console.log(chalk.dim(`Error: ${error.message}`));
          }
          console.log(
            chalk.yellow(`\nYou can install them manually later with:`)
          );
          console.log(chalk.cyan(`  cd ${projectName}/ios`));
          console.log(chalk.cyan(`  pod install\n`));
        }
      } else {
        console.log(chalk.yellow("\n⏭️  Skipping iOS CocoaPods installation"));
        console.log(chalk.gray("You can install them later with:"));
        console.log(chalk.cyan(`  cd ${projectName}/ios && pod install\n`));
      }
    } else if (!dependenciesInstalled && process.platform === "darwin") {
      console.log(
        chalk.yellow(
          "⚠️  Skipping iOS CocoaPods installation (dependencies not installed)\n"
        )
      );
    }
  }

  // Step 5: Initialize git
  if (!skipGit) {
    console.log(chalk.cyan("\n📁 Initializing git repository...\n"));
    try {
      await execa("git", ["init"], { cwd: projectPath });
      await execa("git", ["add", "."], { cwd: projectPath });
      await execa(
        "git",
        ["commit", "-m", "Initial commit from @giltripper/create-rn-app"],
        { cwd: projectPath }
      );
      console.log(chalk.green("✅ Git repository initialized\n"));
    } catch (error) {
      console.log(chalk.red("❌ Failed to initialize git"));
      console.log(
        chalk.yellow(`\nYou can initialize git manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  git init`));
      console.log(chalk.cyan(`  git add .`));
      console.log(chalk.cyan(`  git commit -m "Initial commit"\n`));
    }
  }
}

module.exports = { createApp };
