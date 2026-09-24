const fs = require("fs-extra");
const path = require("path");

// The layout the user hands us:
//
//   icons/
//     android/              <- shared, used by any environment without its own
//     Assets.xcassets/
//     development/
//       android/
//       Assets.xcassets/
//     staging/
//       ...
//
// A bare directory with no environment subfolders is the old single-set layout
// and keeps working untouched.
const ANDROID_DIR = "android";
const IOS_DIR = path.join("Assets.xcassets", "AppIcon.appiconset");

async function looksLikeIconSet(dir) {
  if (!dir || !(await fs.pathExists(dir))) {
    return false;
  }
  return (
    (await fs.pathExists(path.join(dir, ANDROID_DIR))) ||
    (await fs.pathExists(path.join(dir, IOS_DIR)))
  );
}

async function subdirectories(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}

// Environment names are matched case-insensitively, so a `Development/` folder
// works as well as `development/`.
function matchEnvironment(name, environments) {
  return environments.find(
    environment => environment.toLowerCase() === name.toLowerCase()
  );
}

async function resolveIconSources(appIconDir, environments = []) {
  const result = { shared: null, byEnv: {}, unmatched: [] };

  if (!appIconDir || !(await fs.pathExists(appIconDir))) {
    return result;
  }

  if (await looksLikeIconSet(appIconDir)) {
    result.shared = appIconDir;
  }

  // `production` always exists as an Android flavor even when it was never
  // picked in the prompt, so an icons/production/ folder is honoured too.
  const known = [...new Set([...environments, "production"])];

  for (const name of await subdirectories(appIconDir)) {
    if (name === ANDROID_DIR || name === "Assets.xcassets") {
      continue;
    }

    const candidate = path.join(appIconDir, name);
    if (!(await looksLikeIconSet(candidate))) {
      continue;
    }

    const environment = matchEnvironment(name, known);
    if (environment) {
      result.byEnv[environment] = candidate;
    } else {
      result.unmatched.push(name);
    }
  }

  return result;
}

module.exports = { resolveIconSources, looksLikeIconSet };
