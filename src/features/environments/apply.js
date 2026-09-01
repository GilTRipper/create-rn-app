const { copyAndroidEnvSources, updateAndroidBuildGradle } = require("./android");
const { updatePodfileForEnvs } = require("./ios-podfile");
const { createIosTargetsForEnvs } = require("./ios-targets");
const { updateBaseTargetBundleId } = require("./ios-bundle-id");
const {
  createIosEnvSchemes,
  renameDefaultIosScheme,
} = require("./ios-schemes");
const { createEnvFiles, addScriptsToPackageJson } = require("./env-files");

async function apply(ctx) {
  const {
    projectPath,
    projectName,
    bundleIdentifier,
    displayName,
    envSetupSelectedEnvs = [],
    firebase = {},
  } = ctx.config;

  const selectedEnvs =
    envSetupSelectedEnvs && envSetupSelectedEnvs.length >= 1
      ? envSetupSelectedEnvs
      : [];
  if (selectedEnvs.length === 0) {
    return;
  }

  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const firebaseFilesByEnv =
    (firebase && firebase.googleFiles && firebase.googleFiles.filesByEnv) || {};

  await copyAndroidEnvSources(
    selectedEnvs,
    projectPath,
    bundleIdentifier,
    displayName
  );
  await updateAndroidBuildGradle(selectedEnvs, projectPath, bundleIdentifier);
  await updatePodfileForEnvs(selectedEnvs, projectPath, projectName, {
    firebaseEnabled,
    firebaseModules,
  });
  const buildableRefs = await createIosTargetsForEnvs(
    selectedEnvs,
    projectPath,
    projectName,
    bundleIdentifier,
    displayName
  );

  await updateBaseTargetBundleId({
    selectedEnvs,
    projectPath,
    projectName,
    bundleIdentifier,
    displayName,
  });

  await createIosEnvSchemes(
    selectedEnvs,
    projectPath,
    projectName,
    buildableRefs || {},
    firebaseEnabled ? firebaseFilesByEnv : {}
  );

  await createEnvFiles(selectedEnvs, projectPath);
  await addScriptsToPackageJson(
    selectedEnvs,
    projectPath,
    projectName,
    bundleIdentifier
  );
}

async function renameDefaultScheme(ctx) {
  const { projectPath, projectName, envSetupSelectedEnvs = [] } = ctx.config;
  const selectedEnvs =
    envSetupSelectedEnvs && envSetupSelectedEnvs.length >= 1
      ? envSetupSelectedEnvs
      : [];
  if (!selectedEnvs || selectedEnvs.length === 0) {
    await renameDefaultIosScheme(projectPath, projectName);
  }
}

module.exports = { apply, renameDefaultScheme };
