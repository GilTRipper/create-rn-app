const fs = require("fs-extra");
const path = require("path");
const { UI_TEMPLATE_COMPONENTS } = require("../features/ui-kit/catalog");

// Everything here reads the project as it is on disk. Each detector returns a
// value plus a short line of evidence, because adopt shows its reasoning and
// lets the user correct it - a silent wrong guess would poison every later
// upgrade.
function found(value, evidence, unknownFields = []) {
  return { value, evidence, unknownFields };
}

function notFound(evidence) {
  return { value: null, evidence };
}

async function readJsonSafe(filePath) {
  try {
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
}

async function readTextSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function detectProjectName(projectPath) {
  // The iOS app directory keeps the name as typed, capitals and all, while
  // package.json only has the lowercase form.
  const iosDir = path.join(projectPath, "ios");
  if (await fs.pathExists(iosDir)) {
    for (const entry of await fs.readdir(iosDir)) {
      if (await fs.pathExists(path.join(iosDir, entry, "AppDelegate.swift"))) {
        return found(entry, `ios/${entry}/AppDelegate.swift`);
      }
    }
  }

  const packageJson = await readJsonSafe(path.join(projectPath, "package.json"));
  if (packageJson?.name) {
    return found(packageJson.name, "package.json name (lowercase only)");
  }
  return notFound("no iOS app directory and no package.json name");
}

async function detectDisplayName(projectPath) {
  const appJson = await readJsonSafe(path.join(projectPath, "app.json"));
  return appJson?.displayName
    ? found(appJson.displayName, "app.json displayName")
    : notFound("app.json has no displayName");
}

async function detectBundleIdentifier(projectPath) {
  const gradle = await readTextSafe(
    path.join(projectPath, "android/app/build.gradle")
  );
  const namespace = gradle?.match(/namespace\s+"([^"]+)"/);
  if (namespace) {
    return found(namespace[1], "namespace in android/app/build.gradle");
  }

  const applicationId = gradle?.match(/applicationId\s+"([^"]+)"/);
  if (applicationId) {
    return found(applicationId[1], "applicationId in android/app/build.gradle");
  }
  return notFound("no namespace or applicationId in android/app/build.gradle");
}

// The template itself ships a pnpm-lock.yaml, so that file is copied into every
// project whatever the user picked - its presence alone proves nothing. Only a
// yarn.lock or package-lock.json can have been written by an actual install,
// so they are checked first, and a lone pnpm lockfile stays a guess.
async function detectPackageManager(projectPath) {
  const decisive = [
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
  ];
  for (const [lockfile, manager] of decisive) {
    if (await fs.pathExists(path.join(projectPath, lockfile))) {
      return found(manager, lockfile);
    }
  }

  if (await fs.pathExists(path.join(projectPath, "pnpm-lock.yaml"))) {
    return found(
      "pnpm",
      "only pnpm-lock.yaml, which the template ships - unconfirmed",
      ["packageManager"]
    );
  }
  return found("npm", "no lockfile, assuming npm", ["packageManager"]);
}

// flavorNames() always appends `production`, and it is not one of the choices
// the prompt offers, so it is never part of the recorded selection.
async function detectEnvironments(projectPath) {
  const gradle = await readTextSafe(
    path.join(projectPath, "android/app/build.gradle")
  );
  const block = gradle?.match(/productFlavors\s*\{([\s\S]*?)\n\s{4}\}/);
  if (!block) {
    return found([], "no productFlavors in android/app/build.gradle");
  }

  const names = [...block[1].matchAll(/^\s{8}(\w+)\s*\{/gm)].map(match => match[1]);
  const selected = names.filter(name => name !== "production");
  return selected.length > 0
    ? found(selected, `productFlavors: ${names.join(", ")}`)
    : found([], "only the production flavor, which is always added");
}

async function detectNavigation(projectPath) {
  const navigationDir = path.join(projectPath, "src/ui/navigation");
  const has = name => fs.pathExists(path.join(navigationDir, name));

  if (await has("AuthNavigator.tsx")) {
    return found("with-auth", "src/ui/navigation/AuthNavigator.tsx");
  }
  if (await has("AppNavigator.tsx")) {
    return found("app-only", "src/ui/navigation/AppNavigator.tsx");
  }
  return found("none", "no src/ui/navigation");
}

async function detectStorage(projectPath) {
  const storagePath = path.join(projectPath, "src/lib/storage.ts");
  return (await fs.pathExists(storagePath))
    ? found(true, "src/lib/storage.ts")
    : found(false, "no src/lib/storage.ts");
}

async function detectTheme(projectPath) {
  const themeDir = path.join(projectPath, "src/lib/theme");
  return (await fs.pathExists(themeDir))
    ? found(true, "src/lib/theme/")
    : found(false, "no src/lib/theme/");
}

async function detectLocalization(projectPath) {
  const localizationDir = path.join(projectPath, "src/lib/localization");
  if (!(await fs.pathExists(localizationDir))) {
    return found(
      { enabled: false, defaultLanguage: null, withRemoteConfig: false },
      "no src/lib/localization/"
    );
  }

  const provider = await readTextSafe(path.join(localizationDir, "provider.tsx"));
  const withRemoteConfig = Boolean(provider?.includes("~/lib/remote-config"));

  // Generation leaves exactly one file in languages/: the chosen default. More
  // than one means the team added languages afterwards, and the original
  // default is no longer recoverable from the directory alone.
  let defaultLanguage = null;
  let evidence = "src/lib/localization/ (default language unknown)";
  const languagesDir = path.join(localizationDir, "languages");
  if (await fs.pathExists(languagesDir)) {
    const languages = (await fs.readdir(languagesDir))
      .filter(name => name.endsWith(".json"))
      .map(name => name.replace(/\.json$/, ""));
    if (languages.length === 1) {
      defaultLanguage = languages[0];
      evidence = `src/lib/localization/languages/${languages[0]}.json`;
    } else if (languages.length > 1) {
      evidence = `languages/: ${languages.join(", ")} - cannot tell which was default`;
    }
  }

  return found(
    { enabled: true, defaultLanguage, withRemoteConfig },
    evidence,
    defaultLanguage ? [] : ["localization.defaultLanguage"]
  );
}

const FIREBASE_MODULES = ["analytics", "remote-config", "messaging"];

async function detectFirebase(projectPath, dependencies) {
  if (!dependencies["@react-native-firebase/app"]) {
    return found(
      { enabled: false, modules: [], googleFilesEnvs: [] },
      "no @react-native-firebase/app"
    );
  }

  const modules = FIREBASE_MODULES.filter(
    module => dependencies[`@react-native-firebase/${module}`]
  );

  // Per-environment Google config files live next to the flavor they belong to.
  const googleFilesEnvs = [];
  const androidSrc = path.join(projectPath, "android/app/src");
  if (await fs.pathExists(androidSrc)) {
    for (const entry of await fs.readdir(androidSrc)) {
      if (
        entry !== "main" &&
        (await fs.pathExists(path.join(androidSrc, entry, "google-services.json")))
      ) {
        googleFilesEnvs.push(entry);
      }
    }
  }

  return found(
    { enabled: true, modules, googleFilesEnvs },
    `@react-native-firebase/app, modules: ${modules.join(", ") || "app only"}`
  );
}

async function detectMaps(projectPath, dependencies) {
  if (dependencies["@rnmapbox/maps"]) {
    return found({ enabled: true, provider: "mapbox" }, "@rnmapbox/maps");
  }
  if (!dependencies["react-native-maps"]) {
    return found({ enabled: false, provider: null }, "no maps dependency");
  }

  const iosName = (await detectProjectName(projectPath)).value;
  const appDelegate = iosName
    ? await readTextSafe(
        path.join(projectPath, "ios", iosName, "AppDelegate.swift")
      )
    : null;

  if (appDelegate?.includes("GMSServices.provideAPIKey")) {
    return found(
      { enabled: true, provider: "google-maps" },
      "react-native-maps + GMSServices in AppDelegate.swift"
    );
  }
  return found(
    { enabled: true, provider: "react-native-maps" },
    "react-native-maps without the Google Maps setup"
  );
}

async function detectUiKit(projectPath) {
  const componentsDir = path.join(projectPath, "src/ui/components");
  if (!(await fs.pathExists(componentsDir))) {
    return found({ enabled: false, components: [] }, "no src/ui/components/");
  }

  const components = [];
  for (const component of UI_TEMPLATE_COMPONENTS) {
    if (await fs.pathExists(path.join(componentsDir, component.dest))) {
      components.push(component.id);
    }
  }

  return components.length > 0
    ? found(
        { enabled: true, components },
        `src/ui/components/: ${components.join(", ")}`
      )
    : found({ enabled: false, components: [] }, "src/ui/components/ is empty");
}

async function detectAssets(projectPath) {
  const fontsDir = path.join(projectPath, "assets/fonts");
  let fonts = false;
  if (await fs.pathExists(fontsDir)) {
    const entries = await fs.readdir(fontsDir);
    fonts = entries.some(name => /\.(ttf|otf)$/i.test(name));
  }

  // Splash and icon images always exist - generation falls back to blanks - so
  // there is no honest way to tell a supplied one from a default. Nothing reads
  // these two fields yet: assets are excluded from every merge, so leaving them
  // unknown costs nothing.
  return found(
    { fonts, splashScreen: null, appIcon: null },
    fonts ? "assets/fonts/ has font files" : "no fonts in assets/fonts/",
    ["assets.splashScreen", "assets.appIcon"]
  );
}

async function detectConfig(projectPath) {
  const packageJson = await readJsonSafe(path.join(projectPath, "package.json"));
  if (!packageJson) {
    throw new Error(`${projectPath} has no readable package.json`);
  }
  if (!packageJson.dependencies?.["react-native"]) {
    throw new Error(`${projectPath} does not look like a React Native app`);
  }

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const detected = {
    projectName: await detectProjectName(projectPath),
    bundleIdentifier: await detectBundleIdentifier(projectPath),
    displayName: await detectDisplayName(projectPath),
    packageManager: await detectPackageManager(projectPath),
    envSetupSelectedEnvs: await detectEnvironments(projectPath),
    navigationMode: await detectNavigation(projectPath),
    zustandStorage: await detectStorage(projectPath),
    theme: await detectTheme(projectPath),
    localization: await detectLocalization(projectPath),
    firebase: await detectFirebase(projectPath, dependencies),
    maps: await detectMaps(projectPath, dependencies),
    uiKit: await detectUiKit(projectPath),
    assets: await detectAssets(projectPath),
  };

  const config = {};
  const evidence = {};
  const unknown = [];

  for (const [field, result] of Object.entries(detected)) {
    config[field] = result.value;
    evidence[field] = result.evidence;
    if (result.value === null) {
      unknown.push(field);
    }
    unknown.push(...result.unknownFields);
  }

  return { config, evidence, unknown, dependencies, reactNative: packageJson.dependencies["react-native"] };
}

module.exports = { detectConfig };
