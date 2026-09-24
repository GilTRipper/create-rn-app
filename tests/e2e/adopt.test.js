const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { generateProject, cleanup } = require("../helpers/generate");
const { MANIFEST_FILENAME, manifestPath } = require("../../src/manifest");

const cliPath = path.join(__dirname, "../../bin/cli.js");

// The repository template is always ahead of the newest published release, so a
// project generated here cannot be recognised by the shipped version map. The
// round-trip tests therefore state the version explicitly; detection itself is
// unit-tested against the real map.
const KNOWN_VERSION = "1.1.6";

function runCli(args) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [cliPath, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return {
      status: error.status,
      output: `${error.stdout || ""}\n${error.stderr || ""}`,
    };
  }
}

describe("adopt: round trip on a generated project", () => {
  let projectPath;
  let original;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-adopt", {
      displayName: "Adopt E2E",
      bundleIdentifier: "com.test.e2eadopt",
      navigationMode: "with-auth",
      zustandStorage: true,
      theme: true,
      localization: { enabled: true, defaultLanguage: "en" },
      maps: { enabled: true, provider: "react-native-maps" },
      uiKit: { enabled: true, components: ["turbo-image"] },
    }));

    original = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
    fs.rmSync(manifestPath(projectPath));
  });

  after(() => cleanup(projectPath));

  it("recovers the configuration the project was generated with", () => {
    const { status } = runCli([
      "adopt",
      "--path",
      projectPath,
      "--from",
      KNOWN_VERSION,
      "--yes",
    ]);
    assert.equal(status, 0);

    const adopted = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));

    for (const field of [
      "projectName",
      "bundleIdentifier",
      "displayName",
      "envSetupSelectedEnvs",
      "navigationMode",
      "zustandStorage",
      "theme",
      "localization",
      "firebase",
      "maps",
      "uiKit",
    ]) {
      assert.deepEqual(
        adopted.config[field],
        original.config[field],
        `${field} was not recovered`
      );
    }
  });

  // Splash and icon images always exist because generation falls back to
  // blanks, so a supplied one cannot be told from a default. Nothing reads
  // these fields, and claiming a value would be a guess.
  it("leaves genuinely undetectable fields unset rather than guessing", () => {
    const adopted = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
    assert.equal(adopted.config.assets.fonts, original.config.assets.fonts);
    assert.equal(adopted.config.assets.splashScreen, null);
    assert.equal(adopted.config.assets.appIcon, null);
  });

  it("records no file baseline and marks the project adopted", () => {
    const adopted = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));

    assert.equal(adopted.adopted, true);
    assert.equal(adopted.cliVersion, KNOWN_VERSION);
    assert.equal(adopted.reactNative, original.reactNative);
    assert.ok(!("files" in adopted), "an adopted project must have no baseline");
    assert.ok(Date.parse(adopted.adoptedAt) > 0);
  });

  it("healthcheck explains the missing baseline instead of inventing one", () => {
    const { status, output } = runCli(["healthcheck", "--path", projectPath]);
    assert.equal(status, 0);
    assert.match(output, /detected by adopt/);
    assert.match(output, /No baseline recorded/);
    assert.ok(!/tracked, \d+ changed/.test(output), "claimed a file comparison");
  });

  it("refuses to adopt a project that already has a manifest", () => {
    const { status, output } = runCli([
      "adopt",
      "--path",
      projectPath,
      "--from",
      KNOWN_VERSION,
      "--yes",
    ]);
    assert.equal(status, 1);
    assert.match(output, /already has/);
    assert.match(output, /--force/);
  });

  it("redoes the adoption with --force", () => {
    const { status } = runCli([
      "adopt",
      "--path",
      projectPath,
      "--from",
      KNOWN_VERSION,
      "--yes",
      "--force",
    ]);
    assert.equal(status, 0);
  });
});

describe("adopt: projects it cannot place", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-adopt-unknown"));
    fs.rmSync(manifestPath(projectPath));
  });

  after(() => cleanup(projectPath));

  // A project built from a template newer than the map matches no published
  // react-native version and no published dependency set. Guessing would hand
  // the first upgrade a wrong snapshot, so it stops and asks.
  it("stops rather than guessing when --yes has nothing to go on", () => {
    const { status, output } = runCli(["adopt", "--path", projectPath, "--yes"]);
    assert.equal(status, 1);
    assert.match(output, /Could not recognise the version/);
    assert.match(output, /--from/);
    assert.equal(fs.existsSync(manifestPath(projectPath)), false);
  });

  it("rejects an unknown --from version", () => {
    const { status, output } = runCli([
      "adopt",
      "--path",
      projectPath,
      "--from",
      "9.9.9",
      "--yes",
    ]);
    assert.equal(status, 1);
    assert.match(output, /Unknown version "9\.9\.9"/);
  });

  it("refuses a directory that is not a React Native app", () => {
    const emptyDir = fs.mkdtempSync(path.join(path.dirname(projectPath), "not-rn-"));
    try {
      const { status, output } = runCli(["adopt", "--path", emptyDir, "--yes"]);
      assert.equal(status, 1);
      assert.match(output, /no readable package\.json/);
      assert.equal(fs.existsSync(path.join(emptyDir, MANIFEST_FILENAME)), false);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
