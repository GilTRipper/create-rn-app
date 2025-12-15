const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { test, log, cleanupPath } = require("./test-helpers");
const testSetup = require("./test-setup");

// Helper function to create project with zustand storage configuration using stdin
async function createProjectWithZustandStorage({
  name,
  bundleId,
  displayName,
  enableZustandStorage = false,
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
  // Zustand storage?
  answers += `${enableZustandStorage ? "yes" : "no"}\n`;

  // Overwrite? (if exists) -> yes
  answers += "yes\n";

  log(`Creating project ${name} with zustand storage config...`, "info");

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

module.exports = async function runZustandStorageTests() {
  const { DEFAULT_PROJECT, DEFAULT_PROJECT_PATH } = testSetup;

  // Test 1: Zustand storage not selected - storage.ts should not exist
  test("Check storage.ts not created when zustand storage not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const storageFilePath = path.join(
      DEFAULT_PROJECT_PATH,
      "src/lib/storage.ts"
    );

    if (fs.existsSync(storageFilePath)) {
      throw new Error(
        "storage.ts found when zustand storage should be disabled"
      );
    }
  });

  // Test 2: Zustand storage selected - storage.ts should be created
  test("Check storage.ts created when zustand storage selected", async () => {
    const projectPath = await createProjectWithZustandStorage({
      name: "test-zustand-storage-enabled",
      bundleId: "com.test.zustandstorage",
      displayName: "Zustand Storage Enabled",
      enableZustandStorage: true,
    });

    const storageFilePath = path.join(projectPath, "src/lib/storage.ts");

    if (!fs.existsSync(storageFilePath)) {
      throw new Error(
        "storage.ts not found when zustand storage should be enabled"
      );
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 3: Zustand storage selected - storage.ts should have correct content
  test("Check storage.ts has correct content when zustand storage selected", async () => {
    const projectPath = await createProjectWithZustandStorage({
      name: "test-zustand-storage-content",
      bundleId: "com.test.zustandstoragecontent",
      displayName: "Zustand Storage Content",
      enableZustandStorage: true,
    });

    const storageFilePath = path.join(projectPath, "src/lib/storage.ts");
    const content = fs.readFileSync(storageFilePath, "utf8");

    // Check for required imports
    if (!content.includes('import { createMMKV } from "react-native-mmkv"')) {
      throw new Error(
        "storage.ts should import createMMKV from react-native-mmkv"
      );
    }

    if (
      !content.includes(
        'import type { StateStorage } from "zustand/middleware"'
      )
    ) {
      throw new Error(
        "storage.ts should import StateStorage type from zustand/middleware"
      );
    }

    // Check for storage instance
    if (!content.includes("const storage = createMMKV()")) {
      throw new Error("storage.ts should create MMKV storage instance");
    }

    // Check for zustandStorage export
    if (!content.includes("export const zustandStorage: StateStorage")) {
      throw new Error(
        "storage.ts should export zustandStorage with StateStorage type"
      );
    }

    // Check for required methods
    if (!content.includes("setItem:")) {
      throw new Error("storage.ts should have setItem method");
    }

    if (!content.includes("getItem:")) {
      throw new Error("storage.ts should have getItem method");
    }

    if (!content.includes("removeItem:")) {
      throw new Error("storage.ts should have removeItem method");
    }

    // Check for correct implementation
    if (!content.includes("storage.set(name, value)")) {
      throw new Error("setItem should call storage.set(name, value)");
    }

    if (!content.includes("storage.getString(name)")) {
      throw new Error("getItem should call storage.getString(name)");
    }

    if (!content.includes("return value ?? null")) {
      throw new Error("getItem should return value ?? null");
    }

    if (!content.includes("storage.remove(name)")) {
      throw new Error("removeItem should call storage.remove(name)");
    }

    // Cleanup
    cleanupPath(projectPath);
  });

  // Test 4: Zustand storage not selected - src/lib directory may or may not exist
  // (it might exist if Firebase lib modules were created, but storage.ts should not exist)
  test("Check src/lib directory structure when zustand storage not selected", () => {
    if (!DEFAULT_PROJECT_PATH) {
      throw new Error("DEFAULT_PROJECT_PATH is not initialized");
    }

    const libPath = path.join(DEFAULT_PROJECT_PATH, "src/lib");
    const storageFilePath = path.join(libPath, "storage.ts");

    // storage.ts should not exist regardless of whether lib directory exists
    if (fs.existsSync(storageFilePath)) {
      throw new Error(
        "storage.ts should not exist when zustand storage is not selected"
      );
    }
  });

  // Test 5: Zustand storage selected - src/lib directory should be created
  test("Check src/lib directory created when zustand storage selected", async () => {
    const projectPath = await createProjectWithZustandStorage({
      name: "test-zustand-storage-dir",
      bundleId: "com.test.zustandstoragedir",
      displayName: "Zustand Storage Dir",
      enableZustandStorage: true,
    });

    const libPath = path.join(projectPath, "src/lib");

    if (!fs.existsSync(libPath)) {
      throw new Error(
        "src/lib directory should be created when zustand storage is selected"
      );
    }

    if (!fs.statSync(libPath).isDirectory()) {
      throw new Error("src/lib should be a directory");
    }

    // Cleanup
    cleanupPath(projectPath);
  });
};


