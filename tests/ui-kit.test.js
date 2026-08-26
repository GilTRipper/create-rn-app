const fs = require("fs");
const path = require("path");
const { createApp } = require("../src/template");
const { UI_KIT_ALL } = require("../src/ui-templates");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

async function generateProject({ name, bundleId, displayName, uiKit }) {
  const projectPath = path.join("/tmp", name);
  cleanupPath(projectPath);
  log(`Generating project ${name} via createApp()...`, "info");

  await createApp({
    projectName: name,
    projectPath,
    bundleIdentifier: bundleId,
    displayName,
    packageManager: testSetup.packageManager,
    skipInstall: true,
    skipGit: true,
    skipPods: true,
    autoYes: false,
    splashScreenDir: null,
    appIconDir: null,
    fontsDir: null,
    envSetupSelectedEnvs: [],
    firebase: { enabled: false, modules: [], googleFiles: { filesByEnv: {} } },
    maps: { enabled: false, provider: null },
    zustandStorage: false,
    navigationMode: "none",
    localization: { enabled: false },
    theme: false,
    uiKit,
  });

  return projectPath;
}

function readPackageJson(projectPath) {
  return JSON.parse(
    fs.readFileSync(path.join(projectPath, "package.json"), "utf8")
  );
}

module.exports = async function runUiKitTests() {
  await test("Check All copies every UI component and injects dependencies", async () => {
    const projectPath = await generateProject({
      name: "test-ui-kit-all",
      bundleId: "com.test.uikitall",
      displayName: "UI Kit All",
      uiKit: { enabled: true, components: [UI_KIT_ALL] },
    });

    const turboPath = path.join(
      projectPath,
      "src/ui/components/atoms/TurboImage.tsx"
    );
    const glassPath = path.join(
      projectPath,
      "src/ui/components/atoms/LiquidGlassView.tsx"
    );
    const atomsIndex = path.join(
      projectPath,
      "src/ui/components/atoms/index.ts"
    );
    const componentsIndex = path.join(
      projectPath,
      "src/ui/components/index.ts"
    );

    if (!fs.existsSync(turboPath) || !fs.existsSync(glassPath)) {
      throw new Error("All should copy TurboImage and LiquidGlassView");
    }

    const indexContent = fs.readFileSync(atomsIndex, "utf8");
    if (
      !indexContent.includes("TurboImage") ||
      !indexContent.includes("LiquidGlassView")
    ) {
      throw new Error("atoms/index.ts should export both UI kit components");
    }

    if (!fs.readFileSync(componentsIndex, "utf8").includes("./atoms")) {
      throw new Error("src/ui/components/index.ts should re-export atoms");
    }

    const deps = readPackageJson(projectPath).dependencies || {};
    if (!deps["react-native-turbo-image"]) {
      throw new Error("All should add react-native-turbo-image");
    }
    if (!deps["@callstack/liquid-glass"]) {
      throw new Error("All should add @callstack/liquid-glass");
    }

    cleanupPath(projectPath);
  });

  await test("Check picking TurboImage copies only that component and dependency", async () => {
    const projectPath = await generateProject({
      name: "test-ui-kit-turbo",
      bundleId: "com.test.uikitturbo",
      displayName: "UI Kit Turbo",
      uiKit: { enabled: true, components: ["turbo-image"] },
    });

    const turboPath = path.join(
      projectPath,
      "src/ui/components/atoms/TurboImage.tsx"
    );
    const glassPath = path.join(
      projectPath,
      "src/ui/components/atoms/LiquidGlassView.tsx"
    );
    const atomsIndex = fs.readFileSync(
      path.join(projectPath, "src/ui/components/atoms/index.ts"),
      "utf8"
    );

    if (!fs.existsSync(turboPath)) {
      throw new Error("TurboImage.tsx should be copied when selected");
    }
    if (fs.existsSync(glassPath)) {
      throw new Error("LiquidGlassView should not be copied unless selected");
    }
    if (!atomsIndex.includes("TurboImage")) {
      throw new Error("atoms/index.ts should export TurboImage");
    }
    if (atomsIndex.includes("LiquidGlassView")) {
      throw new Error("atoms/index.ts should not export unselected components");
    }

    const deps = readPackageJson(projectPath).dependencies || {};
    if (!deps["react-native-turbo-image"]) {
      throw new Error("TurboImage selection should add react-native-turbo-image");
    }
    if (deps["@callstack/liquid-glass"]) {
      throw new Error(
        "@callstack/liquid-glass should not be added unless Liquid Glass is selected"
      );
    }

    cleanupPath(projectPath);
  });
};
