const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const execa = require("execa");
const { replaceInFile } = require("./utils");

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
  } = config;

  const templatePath = path.join(__dirname, "../template");

  // Step 1: Copy template
  const copySpinner = ora("Copying template files...").start();
  try {
    await fs.ensureDir(projectPath);
    await fs.copy(templatePath, projectPath, {
      filter: src => {
        // Skip node_modules, build folders, etc.
        const relativePath = path.relative(templatePath, src);
        return (
          !relativePath.includes("node_modules") &&
          !relativePath.includes(".git") &&
          !relativePath.includes("build") &&
          !relativePath.includes("Pods") &&
          !relativePath.includes("android/app/build") &&
          !relativePath.includes("ios/build")
        );
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

    // Files to replace
    const filesToReplace = [
      "package.json",
      "app.json",
      "index.js",
      "android/settings.gradle",
      "android/app/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "android/app/src/main/java/com/helloworld/MainActivity.kt",
      "android/app/src/main/java/com/helloworld/MainApplication.kt",
      "ios/Podfile",
      "ios/HelloWorld/Info.plist",
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

    // Add package attribute to AndroidManifest.xml
    const androidManifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    if (await fs.pathExists(androidManifestPath)) {
      let manifestContent = await fs.readFile(androidManifestPath, "utf8");
      // Add package attribute to manifest tag if it doesn't exist
      if (!manifestContent.includes("package=")) {
        manifestContent = manifestContent.replace(
          /<manifest xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android">/,
          `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundleIdentifier}">`
        );
        await fs.writeFile(androidManifestPath, manifestContent, "utf8");
      }
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

    replaceSpinner.succeed("Placeholders replaced");
  } catch (error) {
    replaceSpinner.fail("Failed to replace placeholders");
    throw error;
  }

  // Step 2.5: Copy splash screen images if provided
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

