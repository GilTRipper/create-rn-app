const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { getEnvNameForScheme } = require("../../shared/xcode");

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
    const scriptEnv = lowerEnv;

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
      ] = `react-native run-android --mode=${lowerEnv}debug --appId=${bundleIdentifier}`;
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
    const scriptEnv = lowerEnv;
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

module.exports = { createEnvFiles, addScriptsToPackageJson };
