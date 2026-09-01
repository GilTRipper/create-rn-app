const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");

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

module.exports = { copyAppIcons };
