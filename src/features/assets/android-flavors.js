const fs = require("fs-extra");
const path = require("path");

// environments/android.js copies the whole of main/ into every flavour, and it
// runs before assets are copied. So a flavour always holds the template's
// default artwork, and Gradle merges the flavour over main - which means a
// custom icon or splash placed in main alone never reaches a dev or staging
// build. Anything shared has to be written into the flavours as well.
async function flavorSourceDirs(projectPath) {
  const srcPath = path.join(projectPath, "android/app/src");
  if (!(await fs.pathExists(srcPath))) {
    return [];
  }

  const entries = await fs.readdir(srcPath, { withFileTypes: true });
  const flavors = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "main") {
      continue;
    }
    if (await fs.pathExists(path.join(srcPath, entry.name, "res"))) {
      flavors.push(entry.name);
    }
  }
  return flavors.sort();
}

function flavorResPath(projectPath, flavor) {
  return path.join(projectPath, "android/app/src", flavor, "res");
}

module.exports = { flavorSourceDirs, flavorResPath };
