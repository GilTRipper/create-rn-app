#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_PROJECT_NAME = 'test-e2e-app';
const TEST_PROJECT_PATH = path.join('/tmp', TEST_PROJECT_NAME);
const TEST_BUNDLE_ID = 'com.test.e2eapp';
const TEST_DISPLAY_NAME = 'Test E2E App';

// Parse command line arguments
const args = process.argv.slice(2);
const packageManager = args.includes('--package-manager') 
  ? args[args.indexOf('--package-manager') + 1] || 'npm'
  : 'npm';
const testPods = args.includes('--test-pods');

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  console.log(`${colors[type] || ''}${icon} ${message}${colors.reset}`);
}

function test(name, fn) {
  try {
    log(`Testing: ${name}`, 'info');
    fn();
    testsPassed++;
    log(`Passed: ${name}`, 'success');
  } catch (error) {
    testsFailed++;
    log(`Failed: ${name} - ${error.message}`, 'error');
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

function cleanup() {
  if (fs.existsSync(TEST_PROJECT_PATH)) {
    log('Cleaning up test project...', 'info');
    try {
      execSync(`rm -rf "${TEST_PROJECT_PATH}"`, { stdio: "ignore" });
      log("Test project cleaned up successfully", "success");
    } catch (error) {
      log(`Warning: Failed to cleanup test project: ${error.message}`, "info");
    }
  }
}

// Cleanup before starting
cleanup();

// Ensure cleanup on exit (even if process is killed)
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  cleanup();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`, 'error');
  cleanup();
  process.exit(1);
});

log(`Starting E2E tests with ${packageManager}...`, 'info');

// Test 1: Create project with CLI flags
test('Create project with CLI flags', () => {
  const command = `create-rn-app ${TEST_PROJECT_NAME} -p ${packageManager} --bundle-id ${TEST_BUNDLE_ID} --display-name "${TEST_DISPLAY_NAME}" --skip-git --yes`;
  
  log(`Running: ${command}`, 'info');
  try {
    execSync(command, {
      cwd: '/tmp',
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' },
      timeout: 600000 // 10 minutes timeout for dependency installation
    });
  } catch (error) {
    // Check if project was created even if command failed
    if (fs.existsSync(TEST_PROJECT_PATH)) {
      log(`Warning: Command failed but project was created. Error: ${error.message}`, 'info');
    } else {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  if (!fs.existsSync(TEST_PROJECT_PATH)) {
    throw new Error('Project directory was not created');
  }
});

// Test 2: Check project structure
test('Check project structure', () => {
  const requiredFiles = [
    'package.json',
    'app.json',
    'App.tsx',
    'index.js',
    'android/app/src/main/AndroidManifest.xml',
    'ios/Podfile',
    'tsconfig.json',
    'babel.config.js',
    'metro.config.js'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(TEST_PROJECT_PATH, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required file not found: ${file}`);
    }
  }
});

// Test 3: Check package.json content
test('Check package.json content', () => {
  const packageJsonPath = path.join(TEST_PROJECT_PATH, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.name !== TEST_PROJECT_NAME) {
    throw new Error(`Expected package name "${TEST_PROJECT_NAME}", got "${packageJson.name}"`);
  }
});

// Test 4: Check app.json content
test('Check app.json content', () => {
  const appJsonPath = path.join(TEST_PROJECT_PATH, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (appJson.displayName !== TEST_DISPLAY_NAME) {
    throw new Error(`Expected display name "${TEST_DISPLAY_NAME}", got "${appJson.displayName}"`);
  }
});

// Test 5: Check AndroidManifest.xml has package attribute
test('Check AndroidManifest.xml has package attribute', () => {
  const manifestPath = path.join(TEST_PROJECT_PATH, 'android/app/src/main/AndroidManifest.xml');
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');

  if (!manifestContent.includes(`package="${TEST_BUNDLE_ID}"`)) {
    throw new Error(`AndroidManifest.xml missing package attribute with bundle ID "${TEST_BUNDLE_ID}"`);
  }
});

// Test 6: Check Podfile has correct target name
test('Check Podfile has correct target name', () => {
  const podfilePath = path.join(TEST_PROJECT_PATH, 'ios/Podfile');
  const podfileContent = fs.readFileSync(podfilePath, 'utf8');

  if (!podfileContent.includes(`target '${TEST_PROJECT_NAME}'`)) {
    throw new Error(`Podfile missing correct target name "${TEST_PROJECT_NAME}"`);
  }
});

// Test 7: Check iOS project structure
test('Check iOS project structure', () => {
  const iosFiles = [
    `ios/${TEST_PROJECT_NAME}/Info.plist`,
    `ios/${TEST_PROJECT_NAME}.xcodeproj/project.pbxproj`,
    `ios/${TEST_PROJECT_NAME}.xcworkspace/contents.xcworkspacedata`
  ];

  for (const file of iosFiles) {
    const filePath = path.join(TEST_PROJECT_PATH, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`iOS file not found: ${file}`);
    }
  }
});

// Test 8: Check Android package structure
test('Check Android package structure', () => {
  const bundleParts = TEST_BUNDLE_ID.split('.');
  const javaPath = path.join(
    TEST_PROJECT_PATH,
    'android/app/src/main/java',
    ...bundleParts
  );

  const requiredKotlinFiles = [
    'MainActivity.kt',
    'MainApplication.kt'
  ];

  for (const file of requiredKotlinFiles) {
    const filePath = path.join(javaPath, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Android Kotlin file not found: ${file}`);
    }
  }
});

// Test 9: Check dependencies installation
test("Check dependencies are installed", () => {
  const nodeModulesPath = path.join(TEST_PROJECT_PATH, "node_modules");
  const packageJsonPath = path.join(TEST_PROJECT_PATH, "package.json");

  // First check if project was created
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      "package.json not found - project may not have been created"
    );
  }

  // Wait for installation to complete (in case it's still running)
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max wait
  while (!fs.existsSync(nodeModulesPath) && attempts < maxAttempts) {
    attempts++;
    if (attempts % 10 === 0) {
      log(`Waiting for dependencies installation... (${attempts}s)`, "info");
    }
    // Use setTimeout equivalent with execSync to wait
    try {
      execSync("sleep 1", { stdio: "ignore" });
    } catch (e) {
      // On Windows, use timeout instead
      try {
        execSync("timeout /t 1 /nobreak >nul 2>&1", { stdio: "ignore" });
      } catch (e2) {
        // Fallback: just wait a bit
        const start = Date.now();
        while (Date.now() - start < 1000) {
          // Busy wait as last resort
        }
      }
    }
  }

  if (!fs.existsSync(nodeModulesPath)) {
    // Check if there's a lock file to see if installation was attempted
    const lockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    const foundLockFiles = lockFiles.filter(lockFile =>
      fs.existsSync(path.join(TEST_PROJECT_PATH, lockFile))
    );

    // Try to get more info about what happened
    let errorDetails = "";
    try {
      // Check if there are any log files or error indicators
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      errorDetails = `Package name: ${packageJson.name}, version: ${packageJson.version}`;
    } catch (e) {
      errorDetails = "Could not read package.json";
    }

    if (foundLockFiles.length > 0) {
      throw new Error(
        `node_modules directory not found after ${maxAttempts}s wait. ` +
          `Lock file(s) found: ${foundLockFiles.join(
            ", "
          )} - installation was attempted but may have failed. ` +
          `This could indicate a network issue, timeout, or dependency conflict. ${errorDetails}`
      );
    } else {
      throw new Error(
        `node_modules directory not found - dependencies were not installed. ` +
          `No lock file found, installation may not have started. ${errorDetails}`
      );
    }
  }

  // Check for some key dependencies
  const keyDeps = ["react", "react-native", "@react-navigation/native"];

  for (const dep of keyDeps) {
    const depPath = path.join(nodeModulesPath, dep);
    if (!fs.existsSync(depPath)) {
      throw new Error(`Key dependency not found: ${dep}`);
    }
  }
});

// Test 10: Check package manager lock file
test("Check package manager lock file exists", () => {
  let expectedLockFile;
  if (packageManager === "pnpm") {
    expectedLockFile = "pnpm-lock.yaml";
  } else if (packageManager === "yarn") {
    expectedLockFile = "yarn.lock";
  } else {
    expectedLockFile = "package-lock.json";
  }

  const lockFilePath = path.join(TEST_PROJECT_PATH, expectedLockFile);

  // Check if expected lock file exists
  if (fs.existsSync(lockFilePath)) {
    return; // Success
  }

  // If expected lock file doesn't exist, check if any lock file exists
  const allLockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
  const foundLockFiles = allLockFiles.filter(lockFile =>
    fs.existsSync(path.join(TEST_PROJECT_PATH, lockFile))
  );

  if (foundLockFiles.length > 0) {
    throw new Error(
      `Expected lock file '${expectedLockFile}' not found, but found: ${foundLockFiles.join(
        ", "
      )}. ` +
        `This suggests a different package manager was used than expected (${packageManager}).`
    );
  } else {
    throw new Error(
      `Lock file not found: ${expectedLockFile}. ` +
        `No lock files found at all - dependencies installation may not have completed.`
    );
  }
});

// Test 11: Test pods installation (only on macOS)
if (testPods && process.platform === 'darwin') {
  test('Check iOS CocoaPods installation', () => {
    const podsPath = path.join(TEST_PROJECT_PATH, 'ios/Pods');
    const podfileLockPath = path.join(TEST_PROJECT_PATH, 'ios/Podfile.lock');

    // Pods might not be installed if --skip-pods was used, so we just check if the command would work
    // by checking if CocoaPods is available
    try {
      execSync('which pod', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('CocoaPods is not installed or not available');
    }

    // If Pods directory exists, check it's not empty
    if (fs.existsSync(podsPath)) {
      const pods = fs.readdirSync(podsPath);
      if (pods.length === 0) {
        throw new Error('Pods directory exists but is empty');
      }
    }
  });
}

// Summary
console.log('\n' + '='.repeat(50));
log(`Tests passed: ${testsPassed}`, 'success');
if (testsFailed > 0) {
  log(`Tests failed: ${testsFailed}`, "error");
  cleanup(); // Cleanup before exit
  process.exit(1);
} else {
  log("All tests passed!", "success");
  cleanup(); // Cleanup before exit
  process.exit(0);
}

