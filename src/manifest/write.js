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

// An adopted project deliberately gets no `files` map. There is no honest
// record of what the CLI originally generated, and recording the current state
// would make every edit the team has ever made look like untouched template
// output - which the next upgrade would silently overwrite. `adopted` tells
// upgrade to rebuild the baseline from a snapshot of the detected version
// instead, after which the project becomes an ordinary one.
async function writeAdoptedManifest(projectPath, { cliVersion, reactNative, config }) {
  const manifest = {
    manifestVersion: MANIFEST_VERSION,
    cliVersion,
    reactNative: reactNative ?? (await readReactNativeVersion(projectPath)),
    adopted: true,
    adoptedAt: new Date().toISOString(),
    adoptedBy: cliPackageJson.version,
    config,
  };

  await fs.writeJson(manifestPath(projectPath), manifest, { spaces: 2 });
  return manifest;
}

function isAdopted(manifest) {
  return Boolean(manifest?.adopted);
}

module.exports = {
  buildManifest,
  writeManifest,
  writeAdoptedManifest,
  isAdopted,
};
