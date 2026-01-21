#!/usr/bin/env node

const { log, getTestStats } = require("./test-helpers");
const { cleanupAll, initializeProjects } = require("./test-setup");

// Import test modules
const runBasicTests = require("./basic.test");
const runIosTests = require("./ios.test");
const runAndroidTests = require("./android.test");
const runEnvironmentTests = require("./environments.test");
const runFirebaseTests = require("./firebase.test");
const runAssetsTests = require("./assets.test");
const runFontsTests = require("./fonts.test");
const runCliFlagsTests = require("./cli-flags.test");
const runMapsTests = require("./maps.test");
const runZustandStorageTests = require("./zustand-storage.test");
const runNavigationAuthTests = require("./navigation-auth.test");
const runLocalizationTests = require("./localization.test");
const runThemeTests = require("./theme.test");

// Cleanup before starting
cleanupAll();

// Ensure cleanup on exit (even if process is killed)
process.on("exit", cleanupAll);
process.on("SIGINT", () => {
  cleanupAll();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanupAll();
  process.exit(1);
});
process.on("uncaughtException", error => {
  log(`Uncaught exception: ${error.message}`, "error");
  cleanupAll();
  process.exit(1);
});
process.on("unhandledRejection", reason => {
  log(`Unhandled rejection: ${reason}`, "error");
  cleanupAll();
  process.exit(1);
});

async function runAllTests() {
  log("Starting E2E tests...", "info");

  // Initialize and create test projects
  log("\n=== Initializing test projects ===", "info");
  initializeProjects();

  // Run all test suites
  log("\n=== Running Basic Tests ===", "info");
  runBasicTests();

  log("\n=== Running iOS Tests ===", "info");
  runIosTests();

  log("\n=== Running Android Tests ===", "info");
  runAndroidTests();

  log("\n=== Running Environment Tests ===", "info");
  runEnvironmentTests();

  log("\n=== Running Firebase Tests ===", "info");
  runFirebaseTests();

  log("\n=== Running Assets Tests ===", "info");
  runAssetsTests();

  log("\n=== Running Fonts Tests ===", "info");
  runFontsTests();

  log("\n=== Running CLI Flags Tests ===", "info");
  runCliFlagsTests();

  log("\n=== Running Maps Tests ===", "info");
  await runMapsTests();

  log("\n=== Running Zustand Storage Tests ===", "info");
  await runZustandStorageTests();

  log("\n=== Running Navigation & Auth Tests ===", "info");
  await runNavigationAuthTests();

  log("\n=== Running Localization Tests ===", "info");
  await runLocalizationTests();

  log("\n=== Running Theme Tests ===", "info");
  await runThemeTests();

  // Summary
  const { testsPassed, testsFailed } = getTestStats();
  console.log("\n" + "=".repeat(50));
  log(`Tests passed: ${testsPassed}`, "success");
  if (testsFailed > 0) {
    log(`Tests failed: ${testsFailed}`, "error");
    cleanupAll();
    process.exit(1);
  } else {
    log("All tests passed!", "success");
    cleanupAll();
    process.exit(0);
  }
}

runAllTests();