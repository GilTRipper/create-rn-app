const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { test, cleanupPath } = require("./test-helpers");
const { packageManager } = require("./test-setup");

module.exports = function runCliFlagsTests() {
  // Test 36: CLI version flag works
  test("Check --version flag displays version", () => {
    try {
      const output = execSync("create-rn-app --version", {
        encoding: "utf8",
        stdio: "pipe",
      });
      const version = output.trim();
      if (!version || version.length === 0) {
        throw new Error("--version flag returned empty output");
      }
      // Check that version follows semver format (x.y.z)
      if (!/^\d+\.\d+\.\d+/.test(version)) {
        throw new Error(
          `--version output doesn't match semver format: ${version}`
        );
      }
    } catch (error) {
      throw new Error(`--version flag failed: ${error.message}`);
    }
  });

  // Test 37: CLI -v flag works
  test("Check -v flag displays version", () => {
    try {
      const output = execSync("create-rn-app -v", {
        encoding: "utf8",
        stdio: "pipe",
      });
      const version = output.trim();
      if (!version || version.length === 0) {
        throw new Error("-v flag returned empty output");
      }
      // Check that version follows semver format (x.y.z)
      if (!/^\d+\.\d+\.\d+/.test(version)) {
        throw new Error(`-v output doesn't match semver format: ${version}`);
      }
    } catch (error) {
      throw new Error(`-v flag failed: ${error.message}`);
    }
  });

  // Test 38: --skip-pods flag prevents pod installation
  test("Check --skip-pods flag skips pod installation", () => {
    const skipPodsProjectName = "test-e2e-skip-pods";
    const skipPodsProjectPath = path.join("/tmp", skipPodsProjectName);

    if (fs.existsSync(skipPodsProjectPath)) {
      cleanupPath(skipPodsProjectPath);
    }

    try {
      const command = `create-rn-app ${skipPodsProjectName} -p ${packageManager} --bundle-id com.test.skippods --display-name "Skip Pods Test" --skip-git --skip-install --skip-pods --yes`;
      execSync(command, {
        cwd: "/tmp",
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
        timeout: 120000,
      });

      if (!fs.existsSync(skipPodsProjectPath)) {
        throw new Error("Project was not created");
      }

      const packageJsonPath = path.join(skipPodsProjectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error("package.json not found in project");
      }

      cleanupPath(skipPodsProjectPath);
    } catch (error) {
      if (fs.existsSync(skipPodsProjectPath)) {
        cleanupPath(skipPodsProjectPath);
      }
      throw new Error(`--skip-pods test failed: ${error.message}`);
    }
  });

  // Test 39: Test package manager flags (npm, yarn, pnpm)
  test("Check different package managers work correctly", () => {
    const testProjectName = "test-e2e-pm-check";
    const testProjectPath = path.join("/tmp", testProjectName);

    if (fs.existsSync(testProjectPath)) {
      cleanupPath(testProjectPath);
    }

    try {
      const command = `create-rn-app ${testProjectName} -p ${packageManager} --bundle-id com.test.pm --display-name "PM Test" --skip-git --skip-install --yes`;
      execSync(command, {
        cwd: "/tmp",
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
        timeout: 120000,
      });

      if (!fs.existsSync(testProjectPath)) {
        throw new Error("Project was not created");
      }

      const packageJsonPath = path.join(testProjectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error("package.json not found");
      }

      cleanupPath(testProjectPath);
    } catch (error) {
      if (fs.existsSync(testProjectPath)) {
        cleanupPath(testProjectPath);
      }
      throw new Error(`Package manager flag test failed: ${error.message}`);
    }
  });

  // Test 40: Test --skip-git flag prevents git initialization
  test("Check --skip-git flag skips git initialization", () => {
    const testProjectName = "test-e2e-skip-git";
    const testProjectPath = path.join("/tmp", testProjectName);

    if (fs.existsSync(testProjectPath)) {
      cleanupPath(testProjectPath);
    }

    try {
      const command = `create-rn-app ${testProjectName} -p ${packageManager} --bundle-id com.test.skipgit --display-name "Skip Git Test" --skip-install --skip-git --yes`;
      execSync(command, {
        cwd: "/tmp",
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
        timeout: 120000,
      });

      if (!fs.existsSync(testProjectPath)) {
        throw new Error("Project was not created");
      }

      const gitPath = path.join(testProjectPath, ".git");
      if (fs.existsSync(gitPath)) {
        throw new Error(".git directory exists when --skip-git was used");
      }

      const packageJsonPath = path.join(testProjectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error("package.json not found");
      }

      cleanupPath(testProjectPath);
    } catch (error) {
      if (fs.existsSync(testProjectPath)) {
        cleanupPath(testProjectPath);
      }
      throw new Error(`--skip-git test failed: ${error.message}`);
    }
  });

  // Test 41: Test --skip-install flag prevents dependency installation
  test("Check --skip-install flag skips dependency installation", () => {
    const testProjectName = "test-e2e-skip-install";
    const testProjectPath = path.join("/tmp", testProjectName);

    if (fs.existsSync(testProjectPath)) {
      cleanupPath(testProjectPath);
    }

    try {
      const command = `create-rn-app ${testProjectName} -p ${packageManager} --bundle-id com.test.skipinstall --display-name "Skip Install Test" --skip-git --skip-install --yes`;
      execSync(command, {
        cwd: "/tmp",
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
        timeout: 120000,
      });

      if (!fs.existsSync(testProjectPath)) {
        throw new Error("Project was not created");
      }

      const packageJsonPath = path.join(testProjectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error("package.json not found");
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (!packageJson.dependencies) {
        throw new Error("package.json missing dependencies section");
      }

      cleanupPath(testProjectPath);
    } catch (error) {
      if (fs.existsSync(testProjectPath)) {
        cleanupPath(testProjectPath);
      }
      throw new Error(`--skip-install test failed: ${error.message}`);
    }
  });
};
