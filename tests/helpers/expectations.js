const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { exists, join, readJson, readText, readAppDelegate } = require("./fs");
const { UI_KIT_ALL } = require("../../src/ui-templates");

// Placeholders replace-placeholders.js is responsible for. Anything left behind
// means a file was copied after the replacement pass, or missed by it.
const PLACEHOLDERS = ["HelloWorld", "helloworld", "com.helloworld"];

const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "Pods",
  "build",
  ".gradle",
  ".cxx",
  ".idea",
  "DerivedData",
  "vendor",
]);

// Dirs that only exist because someone built or opened the template locally.
// copyTemplate does not filter them, so they ride into every generated app.
const LOCAL_ARTIFACT_DIRS = [
  "android/.idea",
  "android/.gradle",
  "android/app/.cxx",
  "ios/Pods",
  "ios/build",
];

// Xcode writes per-user state next to the project; copying it leaks the
// template author's macOS account name into every generated app.
function xcuserdataDirs(projectPath, projectName) {
  return [
    `ios/${projectName}.xcworkspace/xcuserdata`,
    `ios/${projectName}.xcodeproj/xcuserdata`,
  ];
}

const SCAN_SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns",
  ".ttf", ".otf", ".woff", ".woff2",
  ".jar", ".zip", ".keystore", ".jsbundle", ".hprof", ".xcuserstate",
]);

const DENSITIES = ["hdpi", "mdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

function walkTextFiles(root, visit, relative = "") {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!SCAN_SKIP_DIRS.has(entry.name)) {
        walkTextFiles(root, visit, rel);
      }
      continue;
    }
    if (!entry.isFile() || SCAN_SKIP_EXT.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    visit(rel, fs.readFileSync(path.join(root, rel), "utf8"));
  }
}

function checkCore({ projectPath, projectName, config }) {
  for (const file of [
    "package.json", "app.json", "App.tsx", "index.js", "tsconfig.json",
    "babel.config.js", "metro.config.js", ".gitignore",
    "android/app/src/main/AndroidManifest.xml", "ios/Podfile",
  ]) {
    assert.ok(exists(projectPath, file), `missing ${file}`);
  }
  assert.equal(exists(projectPath, "_gitignore"), false, "_gitignore was not renamed");

  assert.equal(readJson(projectPath, "package.json").name, projectName);
  assert.equal(readJson(projectPath, "app.json").displayName, config.displayName);

  assert.ok(exists(projectPath, "ios", projectName, "Info.plist"));
  assert.ok(exists(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj"));
  assert.ok(exists(projectPath, "ios", `${projectName}.xcworkspace`, "contents.xcworkspacedata"));
  assert.ok(readText(projectPath, "ios/.xcode.env.local").includes("NODE_BINARY"));

  const javaDir = join(projectPath, "android/app/src/main/java", ...config.bundleIdentifier.split("."));
  assert.ok(fs.existsSync(join(javaDir, "MainActivity.kt")), "MainActivity.kt not in the renamed package");
  assert.ok(fs.existsSync(join(javaDir, "MainApplication.kt")), "MainApplication.kt not in the renamed package");

  const gradle = readText(projectPath, "android/app/build.gradle");
  assert.match(gradle, new RegExp(`applicationId\\s+"${config.bundleIdentifier}"`));
  assert.match(gradle, new RegExp(`namespace\\s+"${config.bundleIdentifier}"`));
}

function checkPlaceholders({ projectPath }) {
  const leftovers = [];
  walkTextFiles(projectPath, (rel, content) => {
    for (const placeholder of PLACEHOLDERS) {
      if (content.includes(placeholder)) {
        leftovers.push(`${rel}: ${placeholder}`);
      }
    }
  });
  assert.deepEqual(leftovers, [], "template placeholders left in the generated app:\n" + leftovers.join("\n"));
}

function checkArtifacts({ projectPath, projectName }) {
  const candidates = [...LOCAL_ARTIFACT_DIRS, ...xcuserdataDirs(projectPath, projectName)];
  const leaked = candidates.filter(dir => exists(projectPath, dir));
  assert.deepEqual(
    leaked,
    [],
    "local build artifacts were copied from template/ into the generated app: " + leaked.join(", ")
  );
}

function checkStorage({ projectPath, config }) {
  const expected = Boolean(config.zustandStorage) || config.navigationMode === "with-auth";
  assert.equal(exists(projectPath, "src/lib/storage.ts"), expected, `src/lib/storage.ts presence should be ${expected}`);
  if (expected) {
    assert.ok(readText(projectPath, "src/lib/storage.ts").includes("export const zustandStorage: StateStorage"));
  }
}

function checkNavigation({ projectPath, config }) {
  const mode = config.navigationMode;
  if (mode === "none") {
    assert.equal(exists(projectPath, "src/ui/navigation"), false);
    assert.equal(exists(projectPath, "src/auth"), false);
    return;
  }

  assert.ok(exists(projectPath, "src/ui/navigation/AppNavigator.tsx"));
  const withAuth = mode === "with-auth";
  assert.equal(exists(projectPath, "src/ui/navigation/RootNavigator.tsx"), withAuth);
  assert.equal(exists(projectPath, "src/ui/navigation/AuthNavigator.tsx"), withAuth);
  assert.equal(exists(projectPath, "src/auth/store/index.ts"), withAuth);

  const types = readText(projectPath, "src/ui/navigation/types.ts");
  assert.ok(types.includes("export const enum AppRoutes"));
  assert.equal(types.includes("export const enum AuthRoutes"), withAuth);

  if (withAuth) {
    const store = readText(projectPath, "src/auth/store/index.ts");
    assert.ok(store.includes("createJSONStorage(() => zustandStorage)"), "auth store must persist through storage");
  }
}

function checkTheme({ projectPath, config }) {
  const enabled = Boolean(config.theme);
  assert.equal(exists(projectPath, "src/lib/theme"), enabled);
  if (!enabled) {
    return;
  }
  for (const file of ["index.ts", "provider.tsx", "types.ts", "themes.ts", "store/index.ts"]) {
    assert.ok(exists(projectPath, "src/lib/theme", file), `missing theme/${file}`);
  }
  // The provider persists through Zustand only when storage is on.
  const provider = readText(projectPath, "src/lib/theme/provider.tsx");
  assert.equal(provider.includes("useThemeStore"), Boolean(config.zustandStorage));
}

function checkLocalization({ projectPath, config }) {
  const enabled = Boolean(config.localization && config.localization.enabled);
  assert.equal(exists(projectPath, "src/lib/localization"), enabled);

  const deps = readJson(projectPath, "package.json").dependencies;
  for (const dep of ["i18next", "i18next-icu", "react-i18next"]) {
    assert.equal(Boolean(deps[dep]), enabled, `${dep} presence should be ${enabled}`);
  }
  if (!enabled) {
    return;
  }
  for (const file of ["index.ts", "provider.tsx", "types.ts"]) {
    assert.ok(exists(projectPath, "src/lib/localization", file), `missing localization/${file}`);
  }
  const language = config.localization.defaultLanguage;
  assert.ok(
    exists(projectPath, "src/lib/localization/languages", `${language}.json`),
    `missing languages/${language}.json`
  );
}

function checkUiKit({ projectPath, config }) {
  const deps = readJson(projectPath, "package.json").dependencies;
  const components = config.uiKit && config.uiKit.enabled ? config.uiKit.components : [];
  const all = components.includes(UI_KIT_ALL);

  const turbo = all || components.includes("turbo-image");
  assert.equal(exists(projectPath, "src/ui/components/atoms/TurboImage.tsx"), turbo);
  assert.equal(Boolean(deps["react-native-turbo-image"]), turbo);

  const glass = all || components.includes("liquid-glass");
  assert.equal(exists(projectPath, "src/ui/components/atoms/LiquidGlassView.tsx"), glass);
  assert.equal(Boolean(deps["@callstack/liquid-glass"]), glass);
}

function checkFirebase({ projectPath, projectName, config }) {
  const enabled = Boolean(config.firebase && config.firebase.enabled);
  const modules = enabled ? config.firebase.modules : [];
  const deps = readJson(projectPath, "package.json").dependencies;
  const podfile = readText(projectPath, "ios/Podfile");
  const appDelegate = readAppDelegate(projectPath);
  const appGradle = readText(projectPath, "android/app/build.gradle");
  const rootGradle = readText(projectPath, "android/build.gradle");

  assert.equal(Boolean(deps["@react-native-firebase/app"]), enabled);
  assert.equal(podfile.includes("$RNFirebaseDisableSPM"), enabled);
  assert.equal(podfile.includes("pod 'FirebaseCore'"), enabled);
  assert.equal(appDelegate.includes("FirebaseApp.configure()"), enabled);
  assert.equal(appGradle.includes("com.google.gms.google-services"), enabled);
  assert.equal(rootGradle.includes("com.google.gms:google-services"), enabled);

  const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
  assert.equal(pbxproj.includes("GoogleService-Info.plist"), enabled);

  for (const [moduleName, dep, dir] of [
    ["analytics", "@react-native-firebase/analytics", "src/lib/analytics"],
    ["remote-config", "@react-native-firebase/remote-config", "src/lib/remote-config"],
    ["messaging", "@react-native-firebase/messaging", "src/notifications"],
  ]) {
    const on = modules.includes(moduleName);
    assert.equal(Boolean(deps[dep]), on, `${dep} presence should be ${on}`);
    assert.equal(exists(projectPath, dir), on, `${dir} presence should be ${on}`);
  }
}

function checkMaps({ projectPath, config }) {
  const provider = config.maps && config.maps.enabled ? config.maps.provider : null;
  const deps = readJson(projectPath, "package.json").dependencies;
  const podfile = readText(projectPath, "ios/Podfile");
  const appDelegate = readAppDelegate(projectPath);
  const app = readText(projectPath, "App.tsx");

  assert.equal(
    Boolean(deps["react-native-maps"]),
    provider === "react-native-maps" || provider === "google-maps"
  );
  assert.equal(Boolean(deps["@rnmapbox/maps"]), provider === "mapbox");
  assert.equal(podfile.includes("react-native-maps/Google"), provider === "google-maps");
  assert.equal(appDelegate.includes("import GoogleMaps"), provider === "google-maps");
  assert.equal(exists(projectPath, "src/map"), provider !== null);

  if (provider === "google-maps") {
    assert.ok(appDelegate.includes(config.maps.googleMapsApiKey || "<GOOGLE_MAPS_API_KEY>"));
  }
  if (provider === "mapbox") {
    const token = config.maps.mapboxToken || "<MAPBOX_ACCESS_TOKEN>";
    assert.ok(app.includes(`Mapbox.setAccessToken("${token}")`));
    assert.equal(app.match(/Mapbox\.setAccessToken\(/g).length, 1, "setAccessToken must be injected once");
  }
}

function checkEnvironments({ projectPath, projectName, config }) {
  const envs = config.envSetupSelectedEnvs || [];
  const appGradle = readText(projectPath, "android/app/build.gradle");
  const podfile = readText(projectPath, "ios/Podfile");
  const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
  const schemesDir = join(projectPath, "ios", `${projectName}.xcodeproj`, "xcshareddata", "xcschemes");
  const schemes = fs.existsSync(schemesDir)
    ? fs.readdirSync(schemesDir).filter(file => file.endsWith(".xcscheme"))
    : [];

  assert.equal(appGradle.includes("productFlavors"), envs.length > 0);
  assert.equal(appGradle.includes("envConfigFiles"), envs.length > 0);

  // Flavored debug variants must be listed as debuggable, or the RN gradle
  // plugin bundles JS in a debug build and fails looking for hermesc.
  if (envs.length > 0) {
    const declared = appGradle.match(/^[ \t]*debuggableVariants\s*=\s*\[([^\]]*)\]/m);
    assert.ok(declared, "debuggableVariants is not set even though flavors exist");
    for (const flavor of [...envs.map(env => env.toLowerCase()), "production"]) {
      assert.ok(
        declared[1].includes(`"${flavor}Debug"`),
        `${flavor}Debug missing from debuggableVariants`
      );
    }
  }

  for (const env of envs) {
    const suffix = env.charAt(0).toUpperCase() + env.slice(1);
    assert.ok(exists(projectPath, `.env.${env}`), `missing .env.${env}`);
    assert.ok(schemes.includes(`${projectName}${suffix}.xcscheme`), `missing scheme for ${env}`);
    assert.ok(pbxproj.includes(`${projectName}${suffix}`), `missing iOS target for ${env}`);
    assert.ok(podfile.includes(`target '${projectName}${suffix}'`), `missing Podfile target for ${env}`);
  }

  if (envs.length === 0) {
    assert.equal(exists(projectPath, ".env.staging"), false);
  }
  assert.ok(schemes.includes(`${projectName}.xcscheme`), "base scheme missing");
}

function checkAssets({ projectPath, projectName, config }) {
  if (config.fontsDir) {
    const fonts = fs.readdirSync(join(projectPath, "assets/fonts"));
    assert.ok(fonts.length > 0, "no fonts copied");
    const plist = readText(projectPath, "ios", projectName, "Info.plist");
    const pbxproj = readText(projectPath, "ios", `${projectName}.xcodeproj`, "project.pbxproj");
    for (const font of fonts) {
      assert.ok(plist.includes(`<string>${font}</string>`), `${font} missing from UIAppFonts`);
      assert.ok(pbxproj.includes(`${font} in Resources`), `${font} missing from Xcode resources`);
    }
  }

  for (const file of [
    `ios/${projectName}/Images.xcassets/SplashScreen.imageset/SplashScreen.png`,
    "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
  ]) {
    assert.ok(exists(projectPath, file), `missing ${file}`);
    assert.ok(fs.statSync(join(projectPath, file)).size > 0, `${file} is empty`);
  }

  // Without a custom dir the app keeps the template's drawable/splash.xml
  // layer-list; a blank splash.png beside it is a duplicate resource and
  // breaks mergeResources, and in a density bucket it would hide the layer-list.
  assert.ok(
    exists(projectPath, "android/app/src/main/res/drawable/splash.xml"),
    "the BootTheme windowBackground layer-list is missing"
  );

  if (!config.splashScreenDir) {
    const buckets = ["drawable", ...DENSITIES.map(density => `drawable-${density}`)];
    const stray = buckets.filter(bucket =>
      exists(projectPath, "android/app/src/main/res", bucket, "splash.png")
    );
    assert.deepEqual(stray, [], "blank splash.png written next to the layer-list: " + stray.join(", "));
  }

  if (config.splashScreenDir) {
    for (const density of DENSITIES) {
      assert.ok(
        exists(projectPath, "android/app/src/main/res", `drawable-${density}`, "splash.png"),
        `custom splash missing for drawable-${density}`
      );
    }
  }

  if (config.appIconDir) {
    for (const density of DENSITIES) {
      assert.ok(
        exists(projectPath, "android/app/src/main/res", `mipmap-${density}`, "ic_launcher.png"),
        `custom launcher icon missing for mipmap-${density}`
      );
    }
  }
}

// Android resource names are the file basename, so splash.xml and splash.png
// in one bucket are the same resource twice and mergeDebugResources fails.
// Cheap to check here; otherwise it only shows up in a full gradle build.
function checkAndroidResources({ projectPath }) {
  const resPath = join(projectPath, "android/app/src/main/res");
  const duplicates = [];

  for (const bucket of fs.readdirSync(resPath)) {
    if (!/^(drawable|mipmap)/.test(bucket)) {
      continue;
    }
    const byName = new Map();
    for (const entry of fs.readdirSync(join(resPath, bucket))) {
      const name = entry.replace(/\.[^.]+$/, "");
      byName.set(name, [...(byName.get(name) || []), entry]);
    }
    for (const [name, files] of byName) {
      if (files.length > 1) {
        duplicates.push(`res/${bucket}: ${name} -> ${files.join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    duplicates,
    [],
    "duplicate Android resources; gradle mergeResources will fail:\n" + duplicates.join("\n")
  );
}

function checkAppTsx({ projectPath, config }) {
  const app = readText(projectPath, "App.tsx");
  const messaging = Boolean(config.firebase && config.firebase.enabled) &&
    config.firebase.modules.includes("messaging");

  assert.equal(app.includes("ThemeProvider"), Boolean(config.theme));
  assert.equal(app.includes("LocalizationProvider"), Boolean(config.localization && config.localization.enabled));
  assert.equal(app.includes("NavigationContainer"), config.navigationMode !== "none");
  assert.equal(app.includes("<RootNavigator />"), config.navigationMode === "with-auth");
  assert.equal(app.includes("<AppNavigator />"), config.navigationMode === "app-only");
  assert.equal(app.includes("useHandlePushNotificationToken"), messaging);

  // Providers must nest, not sit side by side, and App stays a single export.
  if (config.theme && config.localization && config.localization.enabled) {
    assert.ok(
      app.indexOf("<ThemeProvider>") < app.indexOf("<LocalizationProvider>"),
      "ThemeProvider must wrap LocalizationProvider"
    );
  }
  assert.equal((app.match(/export const App = /g) || []).length, 1, "App must be exported exactly once");
}

const CHECKS = [
  ["core", checkCore],
  ["placeholders", checkPlaceholders],
  ["artifacts", checkArtifacts],
  ["storage", checkStorage],
  ["navigation", checkNavigation],
  ["theme", checkTheme],
  ["localization", checkLocalization],
  ["ui-kit", checkUiKit],
  ["firebase", checkFirebase],
  ["maps", checkMaps],
  ["environments", checkEnvironments],
  ["assets", checkAssets],
  ["android-resources", checkAndroidResources],
  ["app-tsx", checkAppTsx],
];

module.exports = { CHECKS, walkTextFiles, LOCAL_ARTIFACT_DIRS };
