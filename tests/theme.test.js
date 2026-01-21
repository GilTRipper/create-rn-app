const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

async function createProjectWithTheme({ name, bundleId, displayName, enableZustand }) {
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
  // Zustand storage? -> yes/no (first prompt)
  answers += `${enableZustand ? "yes" : "no"}\n`;
  // Navigation? -> no
  answers += "no\n";
  // Localization? -> no
  answers += "no\n";
  // Theme? -> yes
  answers += "yes\n";
  // Follow-up: enable Zustand for theme? (only asked if first was no)
  if (!enableZustand) {
    answers += "no\n";
  }
  // Overwrite? -> yes
  answers += "yes\n";

  log(`Creating project ${name} with theme (enableZustand=${enableZustand})...`, "info");

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

module.exports = async function runThemeTests() {
  test("Check theme preset created and App.tsx wrapped when theme enabled without Zustand", async () => {
    const projectPath = await createProjectWithTheme({
      name: "test-theme-no-zustand",
      bundleId: "com.test.themeno",
      displayName: "Theme No Zustand",
      enableZustand: false,
    });

    const themeDir = path.join(projectPath, "src/lib/theme");
    if (!fs.existsSync(themeDir)) {
      throw new Error("src/lib/theme should exist when theme enabled");
    }

    const requiredFiles = [
      "index.ts",
      "provider.tsx",
      "types.ts",
      "themes.ts",
      "store/index.ts",
    ];
    for (const file of requiredFiles) {
      const filePath = path.join(themeDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Theme file not found: ${file}`);
      }
    }

    const storagePath = path.join(projectPath, "src/lib/storage.ts");
    if (fs.existsSync(storagePath)) {
      throw new Error(
        "src/lib/storage.ts should NOT be created when theme enabled without Zustand"
      );
    }

    const providerPath = path.join(themeDir, "provider.tsx");
    const providerContent = fs.readFileSync(providerPath, "utf8");
    if (providerContent.includes("useThemeStore")) {
      throw new Error(
        "provider.tsx should not use useThemeStore when theme enabled without Zustand"
      );
    }
    if (!providerContent.includes("useState(")) {
      throw new Error(
        "provider.tsx should use useState-based theme selection when no Zustand"
      );
    }

    const appTsxPath = path.join(projectPath, "App.tsx");
    const appContent = fs.readFileSync(appTsxPath, "utf8");
    if (!appContent.includes("ThemeProvider")) {
      throw new Error("App.tsx should wrap content in ThemeProvider when theme enabled");
    }

    cleanupPath(projectPath);
  });

  test("Check theme preset uses Zustand store and storage when enabled with Zustand", async () => {
    const projectPath = await createProjectWithTheme({
      name: "test-theme-with-zustand",
      bundleId: "com.test.themewith",
      displayName: "Theme With Zustand",
      enableZustand: true,
    });

    const themeDir = path.join(projectPath, "src/lib/theme");
    if (!fs.existsSync(themeDir)) {
      throw new Error("src/lib/theme should exist when theme enabled");
    }

    const storagePath = path.join(projectPath, "src/lib/storage.ts");
    if (!fs.existsSync(storagePath)) {
      throw new Error(
        "src/lib/storage.ts should be created when theme enabled with Zustand"
      );
    }

    const storePath = path.join(themeDir, "store/index.ts");
    const storeContent = fs.readFileSync(storePath, "utf8");
    if (!storeContent.includes("create(") || !storeContent.includes("persist(")) {
      throw new Error(
        "theme store should use Zustand create/persist when Zustand storage is enabled"
      );
    }

    const providerPath = path.join(themeDir, "provider.tsx");
    const providerContent = fs.readFileSync(providerPath, "utf8");
    if (!providerContent.includes("useThemeStore")) {
      throw new Error(
        "provider.tsx should use useThemeStore when theme enabled with Zustand"
      );
    }

    cleanupPath(projectPath);
  });
}

