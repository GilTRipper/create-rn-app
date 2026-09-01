const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

async function removeMapsDependencies(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  if (packageData.dependencies) {
    delete packageData.dependencies["react-native-maps"];
    delete packageData.dependencies["react-native-maps-directions"];
    delete packageData.dependencies["@rnmapbox/maps"];
  }

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function addMapboxDependencies(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  packageData.dependencies = packageData.dependencies || {};
  packageData.dependencies["@rnmapbox/maps"] = "^10.2.10";

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function copyMapboxTemplate(projectPath) {
  const sourceMapboxPath = path.join(TEMPLATE_PRESETS, "map-mapbox");

  if (!(await fs.pathExists(sourceMapboxPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Mapbox template directory not found: ${sourceMapboxPath}. Skipping mapbox template copy.`
      )
    );
    return;
  }

  const targetMapPath = path.join(projectPath, "src/map");
  await fs.ensureDir(path.dirname(targetMapPath));

  await fs.copy(sourceMapboxPath, targetMapPath, {
    overwrite: true,
  });
  console.log(chalk.green("✅ Copied Mapbox map template"));
}

async function copyReactNativeMapsTemplate(projectPath) {
  const sourceRnMapsPath = path.join(TEMPLATE_PRESETS, "map-rn");

  if (!(await fs.pathExists(sourceRnMapsPath))) {
    console.log(
      chalk.yellow(
        `⚠️  react-native-maps template directory not found: ${sourceRnMapsPath}. Skipping template copy.`
      )
    );
    return;
  }

  const targetMapPath = path.join(projectPath, "src/map");
  await fs.ensureDir(path.dirname(targetMapPath));

  await fs.copy(sourceRnMapsPath, targetMapPath, {
    overwrite: true,
  });
  console.log(chalk.green("✅ Copied react-native-maps template"));
}

async function updatePodfileForMapbox(projectPath) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  // Check if Mapbox hooks are already added
  if (content.includes("$RNMapboxMaps")) {
    return; // Already configured
  }

  // Add Mapbox require_relative at the top (after node_require function)
  if (!content.includes("require_relative '../node_modules/@rnmapbox/maps/scripts/autolinking'")) {
    // Add after node_require function or after other require_relative
    if (content.includes("node_require('react-native-permissions/scripts/setup.rb')")) {
      content = content.replace(
        /(node_require\('react-native-permissions\/scripts\/setup\.rb'\)\s*\n)/,
        `$1require_relative '../node_modules/@rnmapbox/maps/scripts/autolinking'\n`
      );
    } else if (content.includes("require_relative")) {
      content = content.replace(
        /(require_relative[^\n]+\n)/,
        `$1require_relative '../node_modules/@rnmapbox/maps/scripts/autolinking'\n`
      );
    } else {
      // Add after platform declaration
      content = content.replace(
        /(platform\s+:ios[^\n]+\n)/,
        `$1require_relative '../node_modules/@rnmapbox/maps/scripts/autolinking'\n`
      );
    }
  }

  // Add Mapbox pre_install hook
  if (content.includes("pre_install do |installer|")) {
    if (!content.includes("$RNMapboxMaps.pre_install")) {
      content = content.replace(
        /(pre_install do \|installer\|\s*\n)/,
        `$1    $RNMapboxMaps.pre_install(installer)\n`
      );
    }
  } else if (content.includes("post_install do")) {
    content = content.replace(
      /(\n[ \t]*)post_install do/,
      `\n  pre_install do |installer|\n    $RNMapboxMaps.pre_install(installer)\n  end$1post_install do`
    );
  }

  // Add Mapbox post_install hook
  if (content.includes("post_install do |installer|")) {
    // Add to existing post_install, right after the opening
    if (!content.includes("$RNMapboxMaps.post_install")) {
      content = content.replace(
        /(post_install do \|installer\|\s*\n)/,
        `$1    $RNMapboxMaps.post_install(installer)\n\n`
      );
    }
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAndroidBuildGradleForMapbox(projectPath) {
  const buildGradlePath = path.join(projectPath, "android/build.gradle");
  if (!(await fs.pathExists(buildGradlePath))) return;

  let content = await fs.readFile(buildGradlePath, "utf8");

  // Check if Mapbox repository is already added
  if (content.includes("api.mapbox.com/downloads/v2/releases/maven")) {
    return; // Already configured
  }

  const mapboxMaven = `            maven {\n                url 'https://api.mapbox.com/downloads/v2/releases/maven'\n            }\n`;

  // RN 0.76+ templates have no allprojects block; append one so Mapbox can resolve.
  if (content.includes("allprojects {")) {
    if (content.includes("repositories {")) {
      content = content.replace(
        /(repositories\s*\{[^}]*mavenCentral\(\)\s*\n)/,
        `$1${mapboxMaven}`
      );
    }
  } else {
    content +=
      "\nallprojects {\n    repositories {\n        maven {\n            url 'https://api.mapbox.com/downloads/v2/releases/maven'\n        }\n    }\n}\n";
  }

  await fs.writeFile(buildGradlePath, content, "utf8");
}

async function updateAppTsxForMapbox(projectPath, mapboxToken) {
  const appTsxPath = path.join(projectPath, "App.tsx");
  if (!(await fs.pathExists(appTsxPath))) return;

  let content = await fs.readFile(appTsxPath, "utf8");

  // Check if Mapbox is already imported
  if (content.includes("@rnmapbox/maps")) {
    // Update token if provided
    if (mapboxToken) {
      content = content.replace(
        /Mapbox\.setAccessToken\([^)]+\)/,
        `Mapbox.setAccessToken("${mapboxToken}")`
      );
    } else if (!content.includes("Mapbox.setAccessToken")) {
      // Add placeholder if not exists
      const importMatch = content.match(/import\s+Mapbox\s+from\s+["']@rnmapbox\/maps["']/);
      if (importMatch) {
        // Find where to add initialization - before App component or at top level
        if (content.includes("export const App")) {
          content = content.replace(
            /(import\s+Mapbox\s+from\s+["']@rnmapbox\/maps["'];?\s*\n)/,
            `$1\nMapbox.setAccessToken("<MAPBOX_ACCESS_TOKEN>");\n`
          );
        }
      }
    }
  } else {
    // Add Mapbox import and initialization
    const importLine = 'import Mapbox from "@rnmapbox/maps";\n';
    const initLine = mapboxToken
      ? `Mapbox.setAccessToken("${mapboxToken}");\n`
      : `Mapbox.setAccessToken("<MAPBOX_ACCESS_TOKEN>");\n`;

    // Add import after React imports or at the top
    if (content.includes('import React')) {
      content = content.replace(
        /(import\s+React[^\n]*\n)/,
        `$1${importLine}`
      );
    } else if (content.includes('import ')) {
      // Add after last import
      content = content.replace(
        /(import\s+[^\n]+\n)/,
        `$1${importLine}`
      );
    } else {
      // Add at the top
      content = `${importLine}${content}`;
    }

    // Add initialization before App component or at top level
    if (content.includes("export const App")) {
      content = content.replace(
        /(import\s+Mapbox\s+from\s+["']@rnmapbox\/maps["'];?\s*\n)/,
        `$1${initLine}`
      );
    } else {
      // Add at top level after imports
      content = content.replace(
        /(import\s+Mapbox\s+from\s+["']@rnmapbox\/maps["'];?\s*\n)/,
        `$1${initLine}`
      );
    }
  }

  await fs.writeFile(appTsxPath, content, "utf8");
}

async function updatePodfileForMaps(projectPath, enableGoogleMaps) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps pod configuration
    // Match the comment and pod declaration, including the rn_maps_path line
    // Replace with newline to ensure proper spacing before post_install
    content = content.replace(
      /\s*# Google Maps для react-native-maps\s*\n\s*rn_maps_path = '\.\.\/node_modules\/react-native-maps'\s*\n\s*pod 'react-native-maps\/Google', :path => rn_maps_path\s*\n?/,
      "\n"
    );
    // Ensure post_install always starts on a new line with proper indentation
    // Normalize any spacing issues: ensure ) is followed by newline, then empty line, then post_install
    content = content.replace(
      /(\s*\))\s*\n?\s*post_install\s+do/,
      "$1\n\n  post_install do"
    );
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAppDelegateForMaps(
  projectPath,
  projectName,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const appDelegatePath = path.join(
    projectPath,
    `ios/${projectName}/AppDelegate.swift`
  );
  if (!(await fs.pathExists(appDelegatePath))) return;

  let content = await fs.readFile(appDelegatePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps import
    content = content.replace(/import GoogleMaps\n/, "");
    // Remove Google Maps initialization (with comment)
    content = content.replace(
      /\s*\/\/ Initialize Google Maps\s*\n\s*GMSServices\.provideAPIKey\("[^"]*"\)\s*\n\s*/,
      ""
    );
  } else {
    // Ensure Google Maps import exists
    if (!content.includes("import GoogleMaps")) {
      // Add import after other imports
      content = content.replace(
        /(import\s+\w+\n)+/,
        match => `${match}import GoogleMaps\n`
      );
    }
    // Replace API key if provided, otherwise leave placeholder
    if (googleMapsApiKey) {
      content = content.replace(
        /GMSServices\.provideAPIKey\("<GOOGLE_MAPS_API_KEY>"\)/,
        `GMSServices.provideAPIKey("${googleMapsApiKey}")`
      );
    }
    // If no API key, ensure placeholder exists
    if (!content.includes("GMSServices.provideAPIKey")) {
      // Add initialization after didFinishLaunchingWithOptions opening
      content = content.replace(
        /(didFinishLaunchingWithOptions[^:]*:\s*Bool\s*\{)\s*/,
        `$1\n    // Initialize Google Maps\n    GMSServices.provideAPIKey("<GOOGLE_MAPS_API_KEY>")\n    `
      );
    }
  }

  await fs.writeFile(appDelegatePath, content, "utf8");
}

async function updateAndroidManifestForMaps(
  projectPath,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const manifestPath = path.join(
    projectPath,
    "android/app/src/main/AndroidManifest.xml"
  );
  if (!(await fs.pathExists(manifestPath))) return;

  let content = await fs.readFile(manifestPath, "utf8");

  if (!enableGoogleMaps || !googleMapsApiKey) {
    // Ensure the Google Maps API key meta-data is commented out
    // First check if there's an uncommented meta-data tag (any format)
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/>/;

    if (uncommentedPattern.test(content)) {
      // Comment it out
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<!-- <meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="\${GOOGLE_MAPS_API_KEY}" /> -->`
      );
    }
    // If already commented (in any format), leave it as is - no action needed
  } else {
    // Uncomment and set the API key
    const commentedSingleLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/> -->/;
    const commentedMultiLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/> -->/;
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/>/;

    if (commentedMultiLinePattern.test(content)) {
      // Uncomment multi-line format and set API key
      content = content.replace(
        commentedMultiLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (commentedSingleLinePattern.test(content)) {
      // Uncomment single-line format and set API key
      content = content.replace(
        commentedSingleLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (uncommentedPattern.test(content)) {
      // Replace existing API key
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    }
  }

  await fs.writeFile(manifestPath, content, "utf8");
}

// Generate a 24-character hex ID for Xcode project objects

async function apply(ctx) {
  const { projectPath, projectName, maps = {} } = ctx.config;
  const mapsEnabled = maps?.enabled || false;
  const mapsProvider = maps?.provider || null;
  const googleMapsApiKey = maps?.googleMapsApiKey || null;
  const enableGoogleMaps = mapsProvider === "google-maps";
  const enableMapbox = mapsProvider === "mapbox";

  if (!mapsEnabled) {
    await removeMapsDependencies(projectPath);
    await updatePodfileForMaps(projectPath, false);
    await updateAppDelegateForMaps(projectPath, projectName, false, null);
    await updateAndroidManifestForMaps(projectPath, false, null);
  } else if (enableMapbox) {
    await removeMapsDependencies(projectPath);
    await updatePodfileForMaps(projectPath, false);
    await updateAppDelegateForMaps(projectPath, projectName, false, null);
    await updateAndroidManifestForMaps(projectPath, false, null);
    await addMapboxDependencies(projectPath);
    await copyMapboxTemplate(projectPath);
    await updatePodfileForMapbox(projectPath);
    await updateAndroidBuildGradleForMapbox(projectPath);
    await updateAppTsxForMapbox(projectPath, maps?.mapboxToken || null);
  } else {
    await copyReactNativeMapsTemplate(projectPath);
    await updatePodfileForMaps(projectPath, enableGoogleMaps);
    await updateAppDelegateForMaps(
      projectPath,
      projectName,
      enableGoogleMaps,
      googleMapsApiKey
    );
    await updateAndroidManifestForMaps(
      projectPath,
      enableGoogleMaps,
      googleMapsApiKey
    );
  }
}

module.exports = { apply };
