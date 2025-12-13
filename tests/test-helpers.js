const { execSync } = require("child_process");
const fs = require("fs");

let testsPassed = 0;
let testsFailed = 0;
const testPromises = [];

function log(message, type = "info") {
  const colors = {
    info: "\x1b[36m",
    success: "\x1b[32m",
    error: "\x1b[31m",
    reset: "\x1b[0m",
  };
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  console.log(`${colors[type] || ""}${icon} ${message}${colors.reset}`);
}

async function test(name, fn) {
  const testPromise = (async () => {
    try {
      log(`Testing: ${name}`, "info");
      const result = fn();
      // If function returns a Promise, wait for it
      if (result && typeof result.then === "function") {
        await result;
      }
      testsPassed++;
      log(`Passed: ${name}`, "success");
    } catch (error) {
      testsFailed++;
      log(`Failed: ${name} - ${error.message}`, "error");
      if (error.stack) {
        console.error(error.stack);
      }
      // Don't re-throw - we want to continue running other tests
    }
  })();

  testPromises.push(testPromise);
  return testPromise;
}

async function waitForAllTests() {
  await Promise.all(testPromises);
}

function cleanupPath(p) {
  if (fs.existsSync(p)) {
    log(`Cleaning up ${p}...`, "info");
    try {
      execSync(`rm -rf "${p}"`, { stdio: "ignore" });
      log(`Cleaned: ${p}`, "success");
    } catch (error) {
      log(`Warning: Failed to cleanup ${p}: ${error.message}`, "info");
    }
  }
}

function getTestStats() {
  return { testsPassed, testsFailed };
}

function resetTestStats() {
  testsPassed = 0;
  testsFailed = 0;
  testPromises.length = 0;
}

module.exports = {
  log,
  test,
  waitForAllTests,
  cleanupPath,
  getTestStats,
  resetTestStats,
};
