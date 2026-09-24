const path = require("path");
const { hashProjectFiles } = require("../manifest/hash");
const { detectConfig } = require("./detect-config");
const { detectVersion } = require("./detect-version");

// Everything adopt needs to describe a project it did not generate: what the
// config looks like, and which published version most likely produced it.
async function inspectProject(projectPath) {
  const detected = await detectConfig(projectPath);
  const files = await hashProjectFiles(projectPath);

  const version = detectVersion({
    dependencies: detected.dependencies,
    files,
    appDirName: detected.config.projectName,
  });

  return {
    projectPath: path.resolve(projectPath),
    config: detected.config,
    evidence: detected.evidence,
    unknown: detected.unknown,
    reactNative: detected.reactNative,
    version,
  };
}

module.exports = { inspectProject };
