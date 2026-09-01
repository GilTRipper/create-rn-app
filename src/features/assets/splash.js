const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");

function getPngDimensions(buffer) {
  // PNG format: 8-byte signature + IHDR chunk
  // IHDR chunk: width (4 bytes) at offset 16, height (4 bytes) at offset 20
  if (buffer.length < 24) {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

// Function to update BootSplash.storyboard with splash screen image dimensions
async function updateBootSplashStoryboard(projectPath, projectName) {
  const storyboardPath = path.join(
    projectPath,
    `ios/${projectName}/BootSplash.storyboard`
  );

  if (!(await fs.pathExists(storyboardPath))) {
    return;
  }

  try {
    const splashImagePath = path.join(
      projectPath,
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset/SplashScreen.png`
    );

    // Try to read image dimensions, fallback to default if not available
    let imageWidth = 375;
    let imageHeight = 812;

    if (await fs.pathExists(splashImagePath)) {
      try {
        const imageBuffer = await fs.readFile(splashImagePath);
        const dimensions = getPngDimensions(imageBuffer);
        if (dimensions) {
          imageWidth = dimensions.width;
          imageHeight = dimensions.height;
        }
      } catch (error) {
        // If we can't read dimensions, use defaults
      }
    }

    let storyboardContent = await fs.readFile(storyboardPath, "utf8");

    // Update image resource dimensions
    storyboardContent = storyboardContent.replace(
      /(<image name="SplashScreen")\s+width="\d+"\s+height="\d+"(\/>)/,
      `$1 width="${imageWidth}" height="${imageHeight}"$2`
    );

    await fs.writeFile(storyboardPath, storyboardContent, "utf8");
  } catch (error) {
    // Silently fail - storyboard structure is already correct in template
  }
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
      // Update storyboard even for blank placeholders
      await updateBootSplashStoryboard(projectPath, projectName);
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

          // Update BootSplash.storyboard after copying iOS images
          await updateBootSplashStoryboard(projectPath, projectName);
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

      // Update BootSplash.storyboard after copying iOS images
      await updateBootSplashStoryboard(projectPath, projectName);
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

module.exports = { getPngDimensions, updateBootSplashStoryboard, copySplashScreenImages };
