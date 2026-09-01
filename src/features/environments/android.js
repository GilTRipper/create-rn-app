const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { capitalize } = require("../../shared/xcode");

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

async function copyAndroidEnvSources(
  selectedEnvs,
  projectPath,
  bundleIdentifier,
  displayName
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const mainSrcPath = path.join(projectPath, "android/app/src/main");
  if (!(await fs.pathExists(mainSrcPath))) {
    console.log(
      chalk.yellow(`⚠️  Main source path does not exist: ${mainSrcPath}`)
    );
    return;
  }

  // Helper function to get environment display name
  const getEnvDisplayName = (env, baseDisplayName) => {
    const envNameMap = {
      staging: "Staging",
      development: "Dev",
      local: "Local",
    };
    const envSuffix = envNameMap[env.toLowerCase()] || capitalize(env);
    return `${baseDisplayName} ${envSuffix}`;
  };

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

    // Update app_name in strings.xml for this environment
    const envStringsXmlPath = path.join(envDir, "res/values/strings.xml");
    if (await fs.pathExists(envStringsXmlPath)) {
      let stringsContent = await fs.readFile(envStringsXmlPath, "utf8");
      const envDisplayName = getEnvDisplayName(env, displayName);
      const regex = /<string name="app_name">[^<]*<\/string>/m;
      const replacement = `<string name="app_name">${envDisplayName}</string>`;
      if (regex.test(stringsContent)) {
        stringsContent = stringsContent.replace(regex, replacement);
      } else {
        stringsContent = stringsContent.replace(
          /<\/resources>\s*$/m,
          `    ${replacement}\n</resources>`
        );
      }
      await fs.writeFile(envStringsXmlPath, stringsContent, "utf8");
    }

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
      // Each environment needs a unique applicationId to be a separate app
      // Production uses base bundleIdentifier, others get a suffix
      let applicationId = bundleIdentifier;
      if (lower !== "production") {
        // Use suffix: staging -> .staging, development -> .dev, local -> .local
        const suffixMap = {
          staging: "staging",
          development: "dev",
          local: "local",
        };
        const suffix = suffixMap[lower] || lower;
        applicationId = `${bundleIdentifier}.${suffix}`;
      }
      return `        ${lower} {\n            minSdkVersion rootProject.ext.minSdkVersion\n            applicationId "${applicationId}"\n            targetSdkVersion rootProject.ext.targetSdkVersion\n            resValue "string", "build_config_package", "${bundleIdentifier}"\n        }`;
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

  // Add matchingFallbacks to buildTypes (required for productFlavors)
  // This ensures that debug/release build types can work with all flavors
  const buildTypesRegex =
    /(buildTypes\s*\{[\s\S]*?debug\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug)/m;
  if (buildTypesRegex.test(content) && !content.includes("matchingFallbacks")) {
    content = content.replace(
      buildTypesRegex,
      `$1\n            matchingFallbacks = ['debug', 'release']`
    );
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


module.exports = {
  ensureManifestPackage,
  copyAndroidEnvSources,
  buildEnvConfigFilesBlock,
  buildProductFlavorsBlock,
  updateAndroidBuildGradle,
};
