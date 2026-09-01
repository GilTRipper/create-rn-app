const path = require("path");
const fs = require("fs-extra");

const SRC_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(__dirname, "../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "template");
const TEMPLATE_PRESETS = path.join(REPO_ROOT, "template-presets");
const FIREBASE_LIB_MODULES = path.join(SRC_ROOT, "firebase-lib-modules");
const UI_TEMPLATES_DIR = path.join(REPO_ROOT, "ui-templates");

function ensureAbsolutePath(input) {
  return path.isAbsolute(input)
    ? path.normalize(input)
    : path.normalize(path.join(process.cwd(), input));
}

async function validateExistingDir(input) {
  if (!input || input.trim().length === 0) {
    return true;
  }
  const dirPath = ensureAbsolutePath(input);
  if (!(await fs.pathExists(dirPath))) {
    return "Directory does not exist";
  }
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    return "Path is not a directory";
  }
  return true;
}

function resolveOptionalDir(source) {
  if (!source || source.trim().length === 0) {
    return null;
  }
  return path.normalize(ensureAbsolutePath(source));
}

module.exports = {
  SRC_ROOT,
  REPO_ROOT,
  TEMPLATE_DIR,
  TEMPLATE_PRESETS,
  FIREBASE_LIB_MODULES,
  UI_TEMPLATES_DIR,
  ensureAbsolutePath,
  validateExistingDir,
  resolveOptionalDir,
};
