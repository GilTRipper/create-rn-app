const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateNpmProjectName,
  validateBundleIdentifier,
  collectCliGateErrors,
} = require("../../src/cli-validate");
const { isNodeVersionSupported } = require("../../src/utils");

const cliPath = path.join(__dirname, "../../bin/cli.js");
const describeCliEntry = isNodeVersionSupported(process.versions.node)
  ? describe
  : describe.skip;

describe("validateNpmProjectName", () => {
  it("accepts a lowercase npm package name", () => {
    assert.equal(validateNpmProjectName("my-app"), null);
    assert.equal(validateNpmProjectName("create-rn-shop"), null);
  });

  it("rejects names that validate-npm-package-name would block", () => {
    assert.ok(validateNpmProjectName("My App"));
    assert.ok(validateNpmProjectName("HTTP"));
    assert.ok(validateNpmProjectName(".hidden"));
    assert.match(validateNpmProjectName("My App"), / /i);
  });
});

describe("validateBundleIdentifier", () => {
  it("accepts reverse-DNS ids", () => {
    assert.equal(validateBundleIdentifier("com.company.app"), null);
    assert.equal(validateBundleIdentifier("com.shop.app1"), null);
  });

  it("rejects malformed ids", () => {
    const message = "Bundle identifier must be in format: com.company.app";
    assert.equal(validateBundleIdentifier("invalid"), message);
    assert.equal(validateBundleIdentifier("Com.Company.App"), message);
    assert.equal(validateBundleIdentifier("com."), message);
    assert.equal(validateBundleIdentifier(""), message);
    assert.equal(validateBundleIdentifier(undefined), message);
  });
});

describe("collectCliGateErrors", () => {
  it("returns nothing for a valid config and supported Node", () => {
    assert.deepEqual(
      collectCliGateErrors({
        projectName: "my-app",
        bundleIdentifier: "com.company.app",
        nodeVersion: "22.11.0",
      }),
      []
    );
  });

  it("collects Node, package name, and bundle id errors together", () => {
    const errors = collectCliGateErrors({
      projectName: "My App",
      bundleIdentifier: "INVALID",
      nodeVersion: "20.19.0",
    });
    assert.ok(errors.some(item => item.includes("22.11.0")));
    assert.ok(errors.some(item => /name|capital|URL|URL-safe|lowercase|space/i.test(item)));
    assert.ok(errors.some(item => item.includes("com.company.app")));
  });

  it("rejects Node 22.10 at the CLI gate", () => {
    const errors = collectCliGateErrors({ nodeVersion: "22.10.0" });
    assert.deepEqual(errors, ["Node.js version 22.11.0 or higher is required."]);
  });
});

describeCliEntry("bin/cli.js entry gates", () => {
  function runCli(cwd, args) {
    try {
      execFileSync(process.execPath, [cliPath, ...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, output: "" };
    } catch (error) {
      return {
        status: error.status,
        output: `${error.stdout || ""}\n${error.stderr || ""}`,
      };
    }
  }

  it("exits 1 on an invalid project name and does not generate", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-cli-name-"));
    try {
      const result = runCli(cwd, [
        "My App",
        "--yes",
        "--skip-install",
        "--skip-git",
        "--skip-pods",
        "--bundle-id",
        "com.company.app",
      ]);
      assert.equal(result.status, 1);
      assert.ok(result.output.includes("Invalid project configuration"));
      assert.equal(fs.existsSync(path.join(cwd, "My App")), false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("exits 1 on --bundle-id that is not reverse-DNS and does not generate", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-cli-bundle-"));
    const projectName = `cli-bad-bundle-${process.pid}`;
    try {
      const result = runCli(cwd, [
        projectName,
        "--yes",
        "--skip-install",
        "--skip-git",
        "--skip-pods",
        "--bundle-id",
        "INVALID",
      ]);
      assert.equal(result.status, 1);
      assert.ok(result.output.includes("com.company.app"));
      assert.equal(fs.existsSync(path.join(cwd, projectName)), false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
