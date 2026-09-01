const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");
const path = require("path");
const packageJson = require("../../package.json");

const cliPath = path.join(__dirname, "../../bin/cli.js");

function runCli(...args) {
  return execSync(`node "${cliPath}" ${args.join(" ")}`, {
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe("CLI flags", () => {
  it("prints a semver version for --version and -v", () => {
    const long = runCli("--version").trim();
    const short = runCli("-v").trim();
    assert.match(long, /^\d+\.\d+\.\d+/);
    assert.equal(long, packageJson.version);
    assert.equal(short, long);
  });

  it("prints help", () => {
    const help = runCli("--help");
    assert.ok(help.includes("create-rn-app"));
    assert.ok(help.includes("--skip-install"));
  });
});
