const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

async function createProjectWithLocalization({
  name,
  bundleId,
  displayName,
  defaultLanguage = "en",
  withRemoteConfig = false,
  enableZustandForLocalization = true,
}) {
  const projectPath = path.join("/tmp", name);
  const packageManager = testSetup.packageManager;

  const command = `create-rn-app`;
  const args = [
    name,
    "-p",
    packageManager,
    "--bundle-id",
    bundleId,
    "--display-name",
    displayName,
    "--skip-git",
    "--skip-install",
  ];

  let answers = "";

  // Splash screen? -> skip
  answers += "\n";
  // App icon? -> skip
  answers += "\n";
  // Fonts? -> skip
  answers += "\n";
  // Environments? -> Cancel
  answers += "__CANCEL__\n";
  // Firebase? -> no
  answers += "no\n";
  // Maps? -> Cancel
  answers += "__CANCEL__\n";
  // Zustand storage? -> no (should be auto-created for localization)
  answers += "no\n";
  // Navigation? -> no
  answers += "no\n";

  // Localization? -> yes
  answers += "yes\n";
  // Default language
  answers += `${defaultLanguage}\n`;
  // With remote config?
  answers += `${withRemoteConfig ? "yes" : "no"}\n`;

  // Follow-up: enable Zustand for localization? -> yes/no
  answers += `${enableZustandForLocalization ? "yes" : "no"}\n`;

  // Theme? -> no
  answers += "no\n";

  // Overwrite? -> yes
  answers += "yes\n";

  log(`Creating project ${name} with localization...`, "info");

  return new Promise((resolve, reject) => {
    let isResolvedOrRejected = false;
    let timeout = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const child = spawn(command, args, {
      cwd: "/tmp",
      stdio: ["pipe", "inherit", "inherit"],
      env: { ...process.env, CI: "true" },
      shell: true,
    });

    child.stdin.write(answers);
    child.stdin.end();

    timeout = setTimeout(() => {
      if (!isResolvedOrRejected && !child.killed) {
        isResolvedOrRejected = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
        cleanup();
        reject(new Error("Process timed out after 120 seconds"));
      }
    }, 120000);

    child.on("close", code => {
      if (isResolvedOrRejected) {
        return;
      }
      isResolvedOrRejected = true;
      cleanup();

      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}`));
        return;
      }
      if (!fs.existsSync(projectPath)) {
        reject(new Error("Project directory was not created"));
        return;
      }
      resolve(projectPath);
    });

    child.on("error", error => {
      if (isResolvedOrRejected) {
        return;
      }
      isResolvedOrRejected = true;
      cleanup();
      reject(new Error(`Failed to spawn process: ${error.message}`));
    });
  });
}

module.exports = async function runLocalizationTests() {
  test("Check localization creates lib/localization structure and language file", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-enabled",
      bundleId: "com.test.localization",
      displayName: "Localization Enabled",
      defaultLanguage: "en",
    });

    const localizationDir = path.join(projectPath, "src/lib/localization");
    const languageFile = path.join(
      projectPath,
      "src/lib/localization/languages/en.json"
    );

    if (!fs.existsSync(localizationDir)) {
      throw new Error("src/lib/localization should exist when localization enabled");
    }

    const requiredFiles = [
      "index.ts",
      "provider.tsx",
      "types.ts",
      "store/index.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(localizationDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Localization file not found: ${file}`);
      }
    }

    if (!fs.existsSync(languageFile)) {
      throw new Error("Default language file en.json should be created");
    }

    cleanupPath(projectPath);
  });

  test("Check localization adds i18n dependencies to package.json", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-deps",
      bundleId: "com.test.localizationdeps",
      displayName: "Localization Deps",
      defaultLanguage: "en",
    });

    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    const deps = packageJson.dependencies || {};
    const requiredDeps = ["i18next", "i18next-icu", "react-i18next"];
    for (const dep of requiredDeps) {
      if (!deps[dep]) {
        throw new Error(`package.json should include dependency: ${dep}`);
      }
    }

    cleanupPath(projectPath);
  });

  test("Check localization auto-creates zustand storage", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-storage",
      bundleId: "com.test.localizationstorage",
      displayName: "Localization Storage",
      defaultLanguage: "en",
      enableZustandForLocalization: true,
    });

    const storagePath = path.join(projectPath, "src/lib/storage.ts");
    if (!fs.existsSync(storagePath)) {
      throw new Error("src/lib/storage.ts should be created for localization");
    }

    cleanupPath(projectPath);
  });

  test("Check localization works without Zustand storage when user declines it", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-no-zustand",
      bundleId: "com.test.localizationnozustand",
      displayName: "Localization No Zustand",
      defaultLanguage: "en",
      enableZustandForLocalization: false,
    });

    const storagePath = path.join(projectPath, "src/lib/storage.ts");
    if (fs.existsSync(storagePath)) {
      throw new Error(
        "src/lib/storage.ts should NOT be created when user declines Zustand for localization"
      );
    }

    const localizationDir = path.join(projectPath, "src/lib/localization");
    const providerPath = path.join(localizationDir, "provider.tsx");
    const storePath = path.join(localizationDir, "store/index.ts");

    if (!fs.existsSync(providerPath)) {
      throw new Error("provider.tsx should exist for localization");
    }

    const providerContent = fs.readFileSync(providerPath, "utf8");
    if (providerContent.includes("useLocalizationStore")) {
      throw new Error(
        "provider.tsx should not use useLocalizationStore when localization without Zustand"
      );
    }
    if (!providerContent.includes("useState(")) {
      throw new Error(
        "provider.tsx should use useState-based language state when no Zustand"
      );
    }

    const storeContent = fs.readFileSync(storePath, "utf8");
    if (!/export\s*\{\s*\};?/.test(storeContent.trim())) {
      throw new Error("localization store should be a stub export when no Zustand");
    }

    cleanupPath(projectPath);
  });

  test("Check App.tsx updated to include LocalizationProvider", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-apptsx",
      bundleId: "com.test.localizationapptsx",
      displayName: "Localization AppTsx",
      defaultLanguage: "en",
    });

    const appTsxPath = path.join(projectPath, "App.tsx");
    const content = fs.readFileSync(appTsxPath, "utf8");

    if (!content.includes("LocalizationProvider")) {
      throw new Error("App.tsx should reference LocalizationProvider");
    }

    if (!content.includes("useLocalization")) {
      throw new Error("App.tsx should initialize localization via useLocalization");
    }

    cleanupPath(projectPath);
  });

  test("Check localization provider/store use selected default language", async () => {
    const projectPath = await createProjectWithLocalization({
      name: "test-localization-default-lang",
      bundleId: "com.test.localizationdefaultlang",
      displayName: "Localization Default Lang",
      defaultLanguage: "ar",
    });

    const providerPath = path.join(
      projectPath,
      "src/lib/localization/provider.tsx"
    );
    const storePath = path.join(
      projectPath,
      "src/lib/localization/store/index.ts"
    );

    const providerContent = fs.readFileSync(providerPath, "utf8");
    const storeContent = fs.readFileSync(storePath, "utf8");

    if (!providerContent.includes("./languages/ar.json")) {
      throw new Error("provider.tsx should import selected language JSON file");
    }

    if (!storeContent.includes('language: "ar"')) {
      throw new Error("localization store should default to selected language");
    }

    cleanupPath(projectPath);
  });
};
