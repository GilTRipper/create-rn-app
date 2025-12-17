const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

// Helper function to create project with navigation configuration using stdin
async function createProjectWithNavigation({
  name,
  bundleId,
  displayName,
  navigationMode = "none", // "none", "app-only", "with-auth"
}) {
  const projectPath = path.join("/tmp", name);
  const packageManager = testSetup.packageManager;

  // Build command
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

  // Prepare answers for interactive prompts
  let answers = "";

  // Splash screen? -> skip (Enter)
  answers += "\n";
  // App icon? -> skip (Enter)
  answers += "\n";
  // Fonts? -> skip (Enter)
  answers += "\n";
  // Environments? -> Cancel
  answers += "__CANCEL__\n";
  // Firebase? -> no
  answers += "no\n";
  // Maps? -> Cancel
  answers += "__CANCEL__\n";
  // Zustand storage? -> no (will be auto-created for with-auth)
  answers += "no\n";
  // Navigation? -> depends on navigationMode
  if (navigationMode === "none") {
    answers += "no\n"; // Don't set up navigation
  } else {
    answers += "yes\n"; // Set up navigation
    // Choose variant
    if (navigationMode === "app-only") {
      answers += "0\n"; // First option: "Without auth"
    } else if (navigationMode === "with-auth") {
      answers += "1\n"; // Second option: "With auth"
    }
  }

  // Overwrite? (if exists) -> yes
  answers += "yes\n";

  log(
    `Creating project ${name} with navigation mode: ${navigationMode}...`,
    "info"
  );

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
        return; // Already handled by timeout or error
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
        return; // Already handled by timeout
      }
      isResolvedOrRejected = true;
      cleanup();
      reject(new Error(`Failed to spawn process: ${error.message}`));
    });
  });
}

module.exports = async function runNavigationAuthTests() {
  const { DEFAULT_PROJECT, DEFAULT_PROJECT_PATH } = testSetup;

  // Test 1: Navigation not selected - navigation files should not exist
  test("Check navigation files not created when navigation not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const navigationPath = path.join(DEFAULT_PROJECT_PATH, "src/ui/navigation");
    const authPath = path.join(DEFAULT_PROJECT_PATH, "src/auth");

    if (fs.existsSync(navigationPath)) {
      throw new Error(
        "Navigation directory found when navigation should be disabled"
      );
    }

    if (fs.existsSync(authPath)) {
      throw new Error(
        "Auth directory found when navigation should be disabled"
      );
    }
  });

  // Test 2: App-only navigation - should create AppNavigator only
  test("Check app-only navigation creates correct files", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-app-only",
      bundleId: "com.test.navigationapponly",
      displayName: "Navigation App Only",
      navigationMode: "app-only",
    });

    const navigationPath = path.join(projectPath, "src/ui/navigation");
    const authPath = path.join(projectPath, "src/auth");
    const appNavigatorPath = path.join(navigationPath, "AppNavigator.tsx");
    const typesPath = path.join(navigationPath, "types.ts");
    const indexPath = path.join(navigationPath, "index.ts");
    const rootNavigatorPath = path.join(navigationPath, "RootNavigator.tsx");
    const authNavigatorPath = path.join(navigationPath, "AuthNavigator.tsx");

    // Navigation directory should exist
    if (!fs.existsSync(navigationPath)) {
      throw new Error("Navigation directory should exist for app-only mode");
    }

    // AppNavigator should exist
    if (!fs.existsSync(appNavigatorPath)) {
      throw new Error("AppNavigator.tsx should exist for app-only mode");
    }

    // types.ts should exist
    if (!fs.existsSync(typesPath)) {
      throw new Error("types.ts should exist for app-only mode");
    }

    // index.ts should exist
    if (!fs.existsSync(indexPath)) {
      throw new Error("index.ts should exist for app-only mode");
    }

    // RootNavigator should NOT exist
    if (fs.existsSync(rootNavigatorPath)) {
      throw new Error("RootNavigator.tsx should NOT exist for app-only mode");
    }

    // AuthNavigator should NOT exist
    if (fs.existsSync(authNavigatorPath)) {
      throw new Error("AuthNavigator.tsx should NOT exist for app-only mode");
    }

    // Auth directory should NOT exist
    if (fs.existsSync(authPath)) {
      throw new Error("Auth directory should NOT exist for app-only mode");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 3: App-only navigation - types.ts should only have AppRoutes
  test("Check app-only navigation types.ts has correct content", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-app-only-types",
      bundleId: "com.test.navigationapponlytypes",
      displayName: "Navigation App Only Types",
      navigationMode: "app-only",
    });

    const typesPath = path.join(projectPath, "src/ui/navigation/types.ts");
    const content = fs.readFileSync(typesPath, "utf8");

    // Should have AppRoutes
    if (!content.includes("export const enum AppRoutes")) {
      throw new Error("types.ts should have AppRoutes enum");
    }

    // Should NOT have RootRoutes
    if (content.includes("export const enum RootRoutes")) {
      throw new Error("types.ts should NOT have RootRoutes enum for app-only");
    }

    // Should NOT have AuthRoutes
    if (content.includes("export const enum AuthRoutes")) {
      throw new Error("types.ts should NOT have AuthRoutes enum for app-only");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 4: App-only navigation - index.ts should export AppNavigator
  test("Check app-only navigation index.ts exports AppNavigator", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-app-only-index",
      bundleId: "com.test.navigationapponlyindex",
      displayName: "Navigation App Only Index",
      navigationMode: "app-only",
    });

    const indexPath = path.join(projectPath, "src/ui/navigation/index.ts");
    const content = fs.readFileSync(indexPath, "utf8");

    // Should export AppNavigator
    if (!content.includes("export { AppNavigator }")) {
      throw new Error("index.ts should export AppNavigator for app-only mode");
    }

    // Should NOT export RootNavigator
    if (content.includes("RootNavigator")) {
      throw new Error(
        "index.ts should NOT export RootNavigator for app-only mode"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 5: App-only navigation - App.tsx should use AppNavigator
  test("Check app-only navigation App.tsx uses AppNavigator", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-app-only-apptsx",
      bundleId: "com.test.navigationapponlyapptsx",
      displayName: "Navigation App Only AppTsx",
      navigationMode: "app-only",
    });

    const appTsxPath = path.join(projectPath, "App.tsx");
    const content = fs.readFileSync(appTsxPath, "utf8");

    // Should import AppNavigator
    if (!content.includes("import { AppNavigator }")) {
      throw new Error("App.tsx should import AppNavigator for app-only mode");
    }

    // Should use AppNavigator
    if (!content.includes("<AppNavigator />")) {
      throw new Error(
        "App.tsx should use AppNavigator component for app-only mode"
      );
    }

    // Should NOT use RootNavigator
    if (content.includes("RootNavigator")) {
      throw new Error("App.tsx should NOT use RootNavigator for app-only mode");
    }

    // Should have NavigationContainer
    if (!content.includes("NavigationContainer")) {
      throw new Error("App.tsx should have NavigationContainer");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 6: With-auth navigation - should create all navigation files
  test("Check with-auth navigation creates all files", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth",
      bundleId: "com.test.navigationwithauth",
      displayName: "Navigation With Auth",
      navigationMode: "with-auth",
    });

    const navigationPath = path.join(projectPath, "src/ui/navigation");
    const authPath = path.join(projectPath, "src/auth");
    const appNavigatorPath = path.join(navigationPath, "AppNavigator.tsx");
    const rootNavigatorPath = path.join(navigationPath, "RootNavigator.tsx");
    const authNavigatorPath = path.join(navigationPath, "AuthNavigator.tsx");
    const typesPath = path.join(navigationPath, "types.ts");
    const indexPath = path.join(navigationPath, "index.ts");
    const authStorePath = path.join(authPath, "store/index.ts");
    const authTypesPath = path.join(authPath, "types.ts");
    const authIndexPath = path.join(authPath, "index.ts");

    // Navigation directory should exist
    if (!fs.existsSync(navigationPath)) {
      throw new Error("Navigation directory should exist for with-auth mode");
    }

    // All navigation files should exist
    if (!fs.existsSync(appNavigatorPath)) {
      throw new Error("AppNavigator.tsx should exist for with-auth mode");
    }

    if (!fs.existsSync(rootNavigatorPath)) {
      throw new Error("RootNavigator.tsx should exist for with-auth mode");
    }

    if (!fs.existsSync(authNavigatorPath)) {
      throw new Error("AuthNavigator.tsx should exist for with-auth mode");
    }

    if (!fs.existsSync(typesPath)) {
      throw new Error("types.ts should exist for with-auth mode");
    }

    if (!fs.existsSync(indexPath)) {
      throw new Error("index.ts should exist for with-auth mode");
    }

    // Auth directory should exist
    if (!fs.existsSync(authPath)) {
      throw new Error("Auth directory should exist for with-auth mode");
    }

    // Auth files should exist
    if (!fs.existsSync(authStorePath)) {
      throw new Error("Auth store should exist for with-auth mode");
    }

    if (!fs.existsSync(authTypesPath)) {
      throw new Error("Auth types should exist for with-auth mode");
    }

    if (!fs.existsSync(authIndexPath)) {
      throw new Error("Auth index should exist for with-auth mode");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 7: With-auth navigation - types.ts should have all routes
  test("Check with-auth navigation types.ts has all routes", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth-types",
      bundleId: "com.test.navigationwithauthtypes",
      displayName: "Navigation With Auth Types",
      navigationMode: "with-auth",
    });

    const typesPath = path.join(projectPath, "src/ui/navigation/types.ts");
    const content = fs.readFileSync(typesPath, "utf8");

    // Should have all route enums
    if (!content.includes("export const enum RootRoutes")) {
      throw new Error(
        "types.ts should have RootRoutes enum for with-auth mode"
      );
    }

    if (!content.includes("export const enum AuthRoutes")) {
      throw new Error(
        "types.ts should have AuthRoutes enum for with-auth mode"
      );
    }

    if (!content.includes("export const enum AppRoutes")) {
      throw new Error("types.ts should have AppRoutes enum for with-auth mode");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 8: With-auth navigation - index.ts should export RootNavigator
  test("Check with-auth navigation index.ts exports RootNavigator", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth-index",
      bundleId: "com.test.navigationwithauthindex",
      displayName: "Navigation With Auth Index",
      navigationMode: "with-auth",
    });

    const indexPath = path.join(projectPath, "src/ui/navigation/index.ts");
    const content = fs.readFileSync(indexPath, "utf8");

    // Should export RootNavigator
    if (!content.includes("export { RootNavigator }")) {
      throw new Error(
        "index.ts should export RootNavigator for with-auth mode"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 9: With-auth navigation - App.tsx should use RootNavigator
  test("Check with-auth navigation App.tsx uses RootNavigator", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth-apptsx",
      bundleId: "com.test.navigationwithauthapptsx",
      displayName: "Navigation With Auth AppTsx",
      navigationMode: "with-auth",
    });

    const appTsxPath = path.join(projectPath, "App.tsx");
    const content = fs.readFileSync(appTsxPath, "utf8");

    // Should import RootNavigator
    if (!content.includes("import { RootNavigator }")) {
      throw new Error("App.tsx should import RootNavigator for with-auth mode");
    }

    // Should use RootNavigator
    if (!content.includes("<RootNavigator />")) {
      throw new Error(
        "App.tsx should use RootNavigator component for with-auth mode"
      );
    }

    // Should have NavigationContainer
    if (!content.includes("NavigationContainer")) {
      throw new Error("App.tsx should have NavigationContainer");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 10: With-auth navigation - should auto-create zustand storage
  test("Check with-auth navigation auto-creates zustand storage", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth-storage",
      bundleId: "com.test.navigationwithauthstorage",
      displayName: "Navigation With Auth Storage",
      navigationMode: "with-auth",
    });

    const storagePath = path.join(projectPath, "src/lib/storage.ts");

    // Zustand storage should be auto-created
    if (!fs.existsSync(storagePath)) {
      throw new Error(
        "Zustand storage should be auto-created for with-auth navigation mode"
      );
    }

    const content = fs.readFileSync(storagePath, "utf8");

    // Should have zustandStorage export
    if (!content.includes("export const zustandStorage")) {
      throw new Error("storage.ts should export zustandStorage");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 11: With-auth navigation - auth store should use zustandStorage
  test("Check with-auth navigation auth store uses zustandStorage", async () => {
    const projectPath = await createProjectWithNavigation({
      name: "test-navigation-with-auth-store",
      bundleId: "com.test.navigationwithauthstore",
      displayName: "Navigation With Auth Store",
      navigationMode: "with-auth",
    });

    const authStorePath = path.join(projectPath, "src/auth/store/index.ts");
    const content = fs.readFileSync(authStorePath, "utf8");

    // Should import zustandStorage
    if (!content.includes("import { zustandStorage }")) {
      throw new Error("Auth store should import zustandStorage");
    }

    // Should use zustandStorage in persist
    if (!content.includes("createJSONStorage(() => zustandStorage)")) {
      throw new Error("Auth store should use zustandStorage in persist");
    }

    // Should export useAuthStore
    if (!content.includes("export const useAuthStore")) {
      throw new Error("Auth store should export useAuthStore");
    }

    // Should export useIsAuthorized
    if (!content.includes("export const useIsAuthorized")) {
      throw new Error("Auth store should export useIsAuthorized");
    }

    // Cleanup
    cleanupPath(projectPath);
  });
};
