const chalk = require("chalk");
const { readManifest, MANIFEST_FILENAME } = require("../manifest");
const { ensureAbsolutePath } = require("../shared/paths");

// A missing manifest is a normal state (an older project, or someone else's
// app); a broken one is not, and readManifest throws for it. Commands decide
// for themselves whether null is fatal.
async function loadProject(options = {}) {
  const projectPath = ensureAbsolutePath(options.path || process.cwd());
  const manifest = await readManifest(projectPath);
  return { projectPath, manifest };
}

function reportMissingManifest(projectPath) {
  console.log(
    chalk.yellow(`\n⚠️  No ${MANIFEST_FILENAME} in ${projectPath}\n`)
  );
  console.log(
    chalk.white(
      "  Either this project was not created by create-rn-app, or it was created"
    )
  );
  console.log(
    chalk.white("  before the CLI started recording one.\n")
  );
}

module.exports = { loadProject, reportMissingManifest };
