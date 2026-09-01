const { getGoogleFilesByEnv, copyFirebaseLibModules } = require("./lib-modules");
const {
  addFirebaseDependencies,
  ensureGoogleServicesPlugin,
  copyFirebaseGoogleFiles,
  updatePodfileForFirebase,
  updateAppDelegateForFirebase,
  addGoogleServicesToXcodeProject,
} = require("./native");
const notifications = require("./notifications");

async function apply(ctx) {
  const { projectPath, projectName, bundleIdentifier, firebase = {} } =
    ctx.config;
  const firebaseEnabled = firebase?.enabled || false;
  if (!firebaseEnabled) {
    return;
  }

  const firebaseModules = firebase?.modules || [];
  const firebaseFilesByEnv = getGoogleFilesByEnv(firebase?.googleFiles);
  const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
  const hasMultipleEnvs = envsInFirebase.length > 1;

  await addFirebaseDependencies(projectPath, firebaseModules, bundleIdentifier);
  await ensureGoogleServicesPlugin(projectPath);
  await copyFirebaseGoogleFiles(
    firebaseFilesByEnv,
    projectPath,
    projectName,
    hasMultipleEnvs
  );
  await updatePodfileForFirebase(projectPath, firebaseModules);
  await updateAppDelegateForFirebase(projectPath, projectName);

  const libModules = firebaseModules.filter(
    module => module === "analytics" || module === "remote-config"
  );
  if (libModules.length > 0) {
    await copyFirebaseLibModules(projectPath, libModules);
  }

  await notifications.apply(ctx);
}

async function addToXcode(ctx) {
  const { projectPath, projectName, firebase = {}, envSetupSelectedEnvs = [] } =
    ctx.config;
  if (!firebase?.enabled) {
    return;
  }
  const firebaseFilesByEnv = getGoogleFilesByEnv(firebase?.googleFiles);
  const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
  const hasMultipleEnvs = envsInFirebase.length > 1;
  const selectedEnvs =
    envSetupSelectedEnvs && envSetupSelectedEnvs.length >= 1
      ? envSetupSelectedEnvs
      : [];
  await addGoogleServicesToXcodeProject(
    projectPath,
    projectName,
    selectedEnvs,
    hasMultipleEnvs
  );
}

module.exports = {
  apply,
  addToXcode,
  getGoogleFilesByEnv,
};
