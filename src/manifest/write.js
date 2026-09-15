const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const {
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} = require("./schema");
const { sanitizeConfig } = require("./sanitize");
const { hashProjectFiles } = require("./hash");
const cliPackageJson = require("../../package.json");

async function readReactNativeVersion(projectPath) {
  try {
    const packageJson = await fs.readJson(path.join(projectPath, "package.json"));
    return packageJson?.dependencies?.["react-native"] ?? null;
  } catch {
    return null;
  }
}

async function buildManifest(config) {
  return {
    manifestVersion: MANIFEST_VERSION,
    cliVersion: cliPackageJson.version,
    reactNative: await readReactNativeVersion(config.projectPath),
    createdAt: new Date().toISOString(),
    config: sanitizeConfig(config),
    files: await hashProjectFiles(config.projectPath),
  };
}

// A project that generated cleanly but failed to record its manifest is still a
// working project, so this warns instead of throwing: losing the whole run over
// a bookkeeping file would be the worse outcome.
async function writeManifest(ctx) {
  const { config } = ctx;

  try {
    const manifest = await buildManifest(config);
    await fs.writeJson(manifestPath(config.projectPath), manifest, {
      spaces: 2,
    });
    return manifest;
  } catch (error) {
    console.log(
      chalk.yellow(`⚠️  Could not write ${MANIFEST_FILENAME}: ${error.message}`)
    );
    console.log(
      chalk.gray(
        "   The project itself is fine, but version migration will not be available for it."
      )
    );
    return null;
  }
}

module.exports = { buildManifest, writeManifest };
