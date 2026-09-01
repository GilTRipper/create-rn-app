const validateProjectName = require("validate-npm-package-name");
const { isNodeVersionSupported } = require("./utils");

const BUNDLE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

function validateNpmProjectName(name) {
  const validation = validateProjectName(name);
  if (validation.validForNewPackages) {
    return null;
  }
  return (
    validation.errors?.join(", ") ||
    validation.warnings?.join(", ") ||
    "Invalid project name"
  );
}

function validateBundleIdentifier(bundleId) {
  if (!bundleId || !BUNDLE_ID_PATTERN.test(bundleId)) {
    return "Bundle identifier must be in format: com.company.app";
  }
  return null;
}

function collectCliGateErrors({
  projectName,
  bundleIdentifier,
  nodeVersion,
} = {}) {
  const errors = [];

  if (nodeVersion !== undefined && !isNodeVersionSupported(nodeVersion)) {
    errors.push("Node.js version 22.11.0 or higher is required.");
  }

  if (projectName !== undefined) {
    const nameError = validateNpmProjectName(projectName);
    if (nameError) {
      errors.push(nameError);
    }
  }

  if (bundleIdentifier !== undefined) {
    const bundleError = validateBundleIdentifier(bundleIdentifier);
    if (bundleError) {
      errors.push(bundleError);
    }
  }

  return errors;
}

module.exports = {
  BUNDLE_ID_PATTERN,
  validateNpmProjectName,
  validateBundleIdentifier,
  collectCliGateErrors,
};
