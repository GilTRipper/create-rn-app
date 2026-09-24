const fs = require("fs-extra");
const path = require("path");
const { capitalize } = require("../../shared/xcode");

// Every environment target gets its own app icon set in the shared asset
// catalog, selected per target with ASSETCATALOG_COMPILER_APPICON_NAME.
//
// The targets are found by the marker createIosTargetsForEnvs already leaves
// behind: each environment's build configurations point INFOPLIST_FILE at
// "<ProjectName> <env>-Info.plist". Matching on that means this never has to
// understand how the targets were built, so the target-creation algorithm
// stays untouched.
function appIconSetName(env) {
  return `AppIcon${capitalize(env)}`;
}

function buildSettingsBlocks(content) {
  const blocks = [];
  const pattern = /buildSettings = \{[\s\S]*?\n\t{3}\};/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    blocks.push({ text: match[0], start: match.index, end: pattern.lastIndex });
  }
  return blocks;
}

function blockBelongsToEnv(block, projectName, env) {
  const marker = `${projectName} ${env}-Info.plist`;
  return block.includes(marker);
}

function withAppIconName(block, name) {
  if (/ASSETCATALOG_COMPILER_APPICON_NAME = [^;]+;/.test(block)) {
    return block.replace(
      /ASSETCATALOG_COMPILER_APPICON_NAME = [^;]+;/,
      `ASSETCATALOG_COMPILER_APPICON_NAME = ${name};`
    );
  }
  // No setting to replace: add one next to INFOPLIST_FILE so it lands inside
  // the same buildSettings block.
  return block.replace(
    /(\n(\t+)INFOPLIST_FILE = [^;]+;)/,
    `$1\n$2ASSETCATALOG_COMPILER_APPICON_NAME = ${name};`
  );
}

// Returns the environments it actually rewrote, so the caller can report what
// happened rather than guess.
async function setAppIconNamesForEnvs(projectPath, projectName, envs) {
  const pbxprojPath = path.join(
    projectPath,
    "ios",
    `${projectName}.xcodeproj`,
    "project.pbxproj"
  );

  if (envs.length === 0 || !(await fs.pathExists(pbxprojPath))) {
    return [];
  }

  let content = await fs.readFile(pbxprojPath, "utf8");
  const applied = [];

  for (const env of envs) {
    const name = appIconSetName(env);
    let changed = false;

    // Rebuilt every pass: replacing one block shifts every later offset.
    const blocks = buildSettingsBlocks(content);
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (!blockBelongsToEnv(block.text, projectName, env)) {
        continue;
      }
      const updated = withAppIconName(block.text, name);
      if (updated !== block.text) {
        content =
          content.slice(0, block.start) + updated + content.slice(block.end);
        changed = true;
      }
    }

    if (changed) {
      applied.push(env);
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
  return applied;
}

module.exports = { setAppIconNamesForEnvs, appIconSetName };
