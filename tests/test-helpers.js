const { execSync } = require("child_process");
const fs = require("fs");

let testsPassed = 0;
let testsFailed = 0;

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

function test(name, fn) {
  try {
    log(`Testing: ${name}`, "info");
    fn();
    testsPassed++;
    log(`Passed: ${name}`, "success");
  } catch (error) {
    testsFailed++;
    log(`Failed: ${name} - ${error.message}`, "error");
    if (error.stack) {
      console.error(error.stack);
    }
  }
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
}

module.exports = {
  log,
  test,
  cleanupPath,
  getTestStats,
  resetTestStats,
};
