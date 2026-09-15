const path = require("path");

const MANIFEST_FILENAME = ".create-rn-app.json";
const MANIFEST_VERSION = 1;

function manifestPath(projectPath) {
  return path.join(projectPath, MANIFEST_FILENAME);
}

function validateManifest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${MANIFEST_FILENAME} is malformed: expected a JSON object`);
  }

  const { manifestVersion } = data;
  if (!Number.isInteger(manifestVersion) || manifestVersion < 1) {
    throw new Error(
      `${MANIFEST_FILENAME} is malformed: missing or invalid "manifestVersion"`
    );
  }

  // Older manifests stay readable (a future version migrates them). A newer one
  // cannot be guessed at, and silently misreading it would corrupt the project.
  if (manifestVersion > MANIFEST_VERSION) {
    throw new Error(
      `${MANIFEST_FILENAME} was written by a newer create-rn-app ` +
        `(manifest v${manifestVersion}, this CLI understands up to v${MANIFEST_VERSION}). ` +
        `Update the CLI to work with this project.`
    );
  }

  if (!data.config || typeof data.config !== "object") {
    throw new Error(`${MANIFEST_FILENAME} is malformed: missing "config"`);
  }

  return data;
}

module.exports = {
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
  validateManifest,
};
