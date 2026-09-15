const validateProjectName = require("validate-npm-package-name");
const { isNodeVersionSupported } = require("./utils");

const BUNDLE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

// `create-rn-app upgrade` has to mean the subcommand, never a project named
// "upgrade". The not-yet-built commands are reserved too: a project created
// under one of those names today would stop being reachable tomorrow.
const RESERVED_COMMAND_NAMES = [
  "add",
  "adopt",
  "features",
  "healthcheck",
  "upgrade",
];

// The generator is built for PascalCase names: replace-placeholders.js swaps
// `HelloWorld` for the name as typed (iOS directories, the Xcode target) and
// `helloworld` for its lowercase form, which is what actually lands in
// package.json and rootProject.name. So npm-validate the lowercase form -
// rejecting capitals outright would reject the prompt's own default, "MyApp".
function validateNpmProjectName(name) {
  const validation = validateProjectName(String(name || "").toLowerCase());
  if (validation.validForNewPackages) {
    return null;
  }
  return (
    validation.errors?.join(", ") ||
    validation.warnings?.join(", ") ||
    "Invalid project name"
  );
}

function validateReservedName(name) {
  if (RESERVED_COMMAND_NAMES.includes(String(name).toLowerCase())) {
    return `"${name}" is a create-rn-app command name, pick another project name`;
  }
  return null;
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
    const nameError =
      validateNpmProjectName(projectName) || validateReservedName(projectName);
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
  RESERVED_COMMAND_NAMES,
  validateNpmProjectName,
  validateReservedName,
  validateBundleIdentifier,
  collectCliGateErrors,
};
