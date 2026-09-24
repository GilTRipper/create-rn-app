const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const { resolveIconSources } = require("./icon-sources");
const { setAppIconNamesForEnvs, appIconSetName } = require("./ios-appicon");
const { flavorSourceDirs, flavorResPath } = require("./android-flavors");

const ANDROID_DENSITIES = [
  "mipmap-hdpi",
  "mipmap-mdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
];

const ANDROID_ICON_FILES = ["ic_launcher.png", "ic_launcher_round.png"];

async function copyAndroidIcons(sourceDir, targetResPath) {
  const androidSourceDir = path.join(sourceDir, "android");
  if (!(await fs.pathExists(androidSourceDir))) {
    return false;
  }

  let copied = false;
  for (const density of ANDROID_DENSITIES) {
    const sourceDensityPath = path.join(androidSourceDir, density);
    if (!(await fs.pathExists(sourceDensityPath))) {
      continue;
    }

    const targetDensityPath = path.join(targetResPath, density);
    await fs.ensureDir(targetDensityPath);

    for (const iconFile of ANDROID_ICON_FILES) {
      const sourceFile = path.join(sourceDensityPath, iconFile);
      if (await fs.pathExists(sourceFile)) {
        await fs.copy(sourceFile, path.join(targetDensityPath, iconFile));
        copied = true;
      }
    }
  }

  return copied;
}

async function copyIosIcons(sourceDir, targetAppIconSet) {
  const iosSourceDir = path.join(
    sourceDir,
    "Assets.xcassets",
    "AppIcon.appiconset"
  );
  if (!(await fs.pathExists(iosSourceDir))) {
    return false;
  }

  // The catalog itself has to exist; without it Xcode has nowhere to put the
  // set and the build settings below would point at nothing.
  if (!(await fs.pathExists(path.dirname(targetAppIconSet)))) {
    return false;
  }

  await fs.ensureDir(targetAppIconSet);

  let copied = false;
  for (const file of await fs.readdir(iosSourceDir)) {
    const sourceFilePath = path.join(iosSourceDir, file);
    const stat = await fs.stat(sourceFilePath);
    if (stat.isFile() && /\.png$/i.test(file)) {
      await fs.copy(sourceFilePath, path.join(targetAppIconSet, file));
      copied = true;
    }
  }

  const contentsJsonSource = path.join(iosSourceDir, "Contents.json");
  if (await fs.pathExists(contentsJsonSource)) {
    await fs.copy(contentsJsonSource, path.join(targetAppIconSet, "Contents.json"));
  } else if (copied) {
    console.log(
      chalk.yellow(
        `⚠️  ${path.basename(targetAppIconSet)} has no Contents.json; Xcode will not use it`
      )
    );
  }

  return copied;
}

function androidResPath(projectPath, flavor) {
  return path.join(projectPath, "android/app/src", flavor, "res");
}

function iosCatalogPath(projectPath, projectName, setName) {
  return path.join(
    projectPath,
    "ios",
    projectName,
    "Images.xcassets",
    `${setName}.appiconset`
  );
}

// `envs` is the environment selection. Icons placed in a matching subfolder go
// to that environment alone: on Android through the flavor's own res/ tree,
// which Gradle merges over main, and on iOS through a separate icon set the
// environment's target is pointed at.
async function copyAppIcons(appIconDir, projectPath, projectName, envs = []) {
  if (!appIconDir) {
    return; // Keep the template's default icons.
  }

  const spinner = ora("Copying app icons...").start();

  try {
    if (!(await fs.pathExists(appIconDir))) {
      spinner.warn("App icon directory does not exist, skipping...");
      return;
    }

    const sources = await resolveIconSources(appIconDir, envs);
    const envNames = Object.keys(sources.byEnv);

    if (!sources.shared && envNames.length === 0) {
      spinner.warn(
        "Expected android/ and Assets.xcassets/AppIcon.appiconset/ inside the icon directory. Skipping..."
      );
      return;
    }

    const done = [];
    // Flavours that get their own set must not be overwritten by the shared one.
    const ownFlavors = new Set(envNames.map(env => env.toLowerCase()));

    if (sources.shared) {
      const android = await copyAndroidIcons(
        sources.shared,
        androidResPath(projectPath, "main")
      );

      // Every flavour already holds a copy of the template's default icons, so
      // writing the shared set only into main would leave dev and staging
      // builds on the stock React Native icon.
      if (android) {
        for (const flavor of await flavorSourceDirs(projectPath)) {
          if (!ownFlavors.has(flavor)) {
            await copyAndroidIcons(sources.shared, flavorResPath(projectPath, flavor));
          }
        }
      }
      const ios = await copyIosIcons(
        sources.shared,
        iosCatalogPath(projectPath, projectName, "AppIcon")
      );
      if (android || ios) {
        done.push("all environments");
      }
    }

    const envsWithIosIcons = [];
    for (const env of envNames) {
      const sourceDir = sources.byEnv[env];
      const android = await copyAndroidIcons(
        sourceDir,
        androidResPath(projectPath, env.toLowerCase())
      );
      const ios = await copyIosIcons(
        sourceDir,
        iosCatalogPath(projectPath, projectName, appIconSetName(env))
      );

      if (ios) {
        envsWithIosIcons.push(env);
      }
      if (android || ios) {
        done.push(env);
      }
    }

    // Only after the sets exist, so no target is ever pointed at a missing one.
    await setAppIconNamesForEnvs(projectPath, projectName, envsWithIosIcons);

    // console, not spinner.warn: this has to survive alongside the spinner and
    // land on the same stream as every other warning the generator prints.
    if (sources.unmatched.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Ignored icon folders that match no environment: ${sources.unmatched.join(", ")}`
        )
      );
    }

    spinner.succeed(
      done.length > 0 ? `App icons copied for ${done.join(", ")}` : "No app icons copied"
    );
  } catch (error) {
    spinner.fail("Failed to copy app icons");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

module.exports = { copyAppIcons };
