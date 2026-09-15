const fs = require("fs-extra");
const path = require("path");
const ora = require("ora");
const { TEMPLATE_DIR } = require("../shared/paths");

async function copyTemplate({ projectPath }) {
  const templatePath = TEMPLATE_DIR;
  const copySpinner = ora("Copying template files...").start();
  try {
    await fs.ensureDir(projectPath);
    await fs.copy(templatePath, projectPath, {
      filter: src => {
        const relativePath = path.relative(templatePath, src);
        const normalizedPath = relativePath.replace(/\\/g, "/");

        if (
          normalizedPath.includes("node_modules") ||
          normalizedPath.includes(".git") ||
          normalizedPath.includes("Pods")
        ) {
          return false;
        }

        // Whatever a local Gradle/Xcode/IDE run left in template/. Copying it
        // bloats the new project (android/app/.cxx alone is over a gigabyte)
        // and xcuserdata carries the template author's account name.
        const localArtifact =
          /(^|\/)(\.cxx|\.gradle|\.idea|\.kotlin|xcuserdata|DerivedData)(\/|$)/;
        if (localArtifact.test(normalizedPath) || normalizedPath.endsWith(".iml")) {
          return false;
        }

        const buildDirPattern = /\/build(\/|$)/;
        if (buildDirPattern.test(normalizedPath)) {
          return false;
        }

        if (normalizedPath.endsWith("build.gradle")) {
          return true;
        }

        return true;
      },
    });

    const gitignorePath = path.join(projectPath, "_gitignore");
    if (await fs.pathExists(gitignorePath)) {
      await fs.move(gitignorePath, path.join(projectPath, ".gitignore"));
    }

    copySpinner.succeed("Template files copied");
  } catch (error) {
    copySpinner.fail("Failed to copy template files");
    throw error;
  }
}

module.exports = { copyTemplate };
