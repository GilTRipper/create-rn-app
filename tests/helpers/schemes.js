const fs = require("fs");
const { join, readText } = require("./fs");

function schemesDir(projectPath, projectName) {
  return join(
    projectPath,
    "ios",
    `${projectName}.xcodeproj`,
    "xcshareddata",
    "xcschemes"
  );
}

function listSchemes(projectPath, projectName) {
  const dir = schemesDir(projectPath, projectName);
  if (!fs.existsSync(dir)) {
    throw new Error(`Schemes directory missing: ${dir}`);
  }
  return fs.readdirSync(dir).filter(file => file.endsWith(".xcscheme")).sort();
}

function readScheme(projectPath, projectName, schemeFile) {
  return readText(
    projectPath,
    "ios",
    `${projectName}.xcodeproj`,
    "xcshareddata",
    "xcschemes",
    schemeFile
  );
}

function flavorApplicationIds(gradle) {
  const blockMatch = gradle.match(/productFlavors\s*\{([\s\S]*?)\n    \}/);
  const block = blockMatch ? blockMatch[1] : gradle;
  const ids = {};
  const flavorRegex = /(\w+)\s*\{[\s\S]*?applicationId\s+"([^"]+)"/g;
  let match;
  while ((match = flavorRegex.exec(block))) {
    ids[match[1]] = match[2];
  }
  return ids;
}

module.exports = {
  schemesDir,
  listSchemes,
  readScheme,
  flavorApplicationIds,
};
