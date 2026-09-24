const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateProject, cleanup } = require("../helpers/generate");
const { manifestPath } = require("../../src/manifest");

const cliPath = path.join(__dirname, "../../bin/cli.js");

// Building the "before" snapshot means downloading a published release from
// npm and installing its dependencies. That is too slow and too network-bound
// for the default run, so the full upgrade is opt-in:
//   npm run test:e2e -- upgrade --network
const networkEnabled = process.env.CREATE_RN_TEST_NETWORK === "1";

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

function git(projectPath, args) {
  execFileSync("git", args, { cwd: projectPath, stdio: "ignore" });
}

function initRepository(projectPath) {
  git(projectPath, ["init", "-q"]);
  git(projectPath, ["config", "user.email", "test@example.com"]);
  git(projectPath, ["config", "user.name", "Test"]);
  git(projectPath, ["add", "-A"]);
  git(projectPath, ["commit", "-m", "initial"]);
}

function readManifestFile(projectPath) {
  return JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
}

function rewriteManifest(projectPath, changes) {
  const manifest = { ...readManifestFile(projectPath), ...changes };
  fs.writeFileSync(manifestPath(projectPath), JSON.stringify(manifest, null, 2));
  return manifest;
}

describe("upgrade: refusals and no-ops", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-upgrade-refuse", {
      navigationMode: "app-only",
    }));
    initRepository(projectPath);
  });

  after(() => cleanup(projectPath));

  // The manifest records the version that generated the project, so a project
  // made by this very CLI is by definition already current.
  it("says there is nothing to do when the versions match", () => {
    const { status, output } = runCli(["upgrade", "--path", projectPath]);
    assert.equal(status, 0);
    assert.match(output, /Already on create-rn-app/);
  });

  it("refuses when the project is newer than the CLI", () => {
    rewriteManifest(projectPath, { cliVersion: "99.0.0" });
    try {
      const { status, output } = runCli(["upgrade", "--path", projectPath]);
      assert.equal(status, 1);
      assert.match(output, /newer than the/);
      assert.match(output, /Update the CLI/);
    } finally {
      git(projectPath, ["checkout", "--", "."]);
    }
  });

  it("refuses a dirty working tree", () => {
    rewriteManifest(projectPath, { cliVersion: "1.0.0" });
    fs.appendFileSync(path.join(projectPath, "App.tsx"), "\n// uncommitted\n");
    try {
      const { status, output } = runCli(["upgrade", "--path", projectPath]);
      assert.equal(status, 1);
      assert.match(output, /Commit or stash/);
    } finally {
      git(projectPath, ["checkout", "--", "."]);
    }
  });

  it("refuses a project with no manifest and points at adopt", () => {
    fs.rmSync(manifestPath(projectPath));
    try {
      const { status, output } = runCli(["upgrade", "--path", projectPath]);
      assert.equal(status, 1);
      assert.match(output, /adopt/);
    } finally {
      git(projectPath, ["checkout", "--", "."]);
    }
  });
});

describe(
  "upgrade: a real jump between published versions",
  { skip: networkEnabled ? false : "needs --network" },
  () => {
    let projectPath;
    const FROM = "1.1.0";

    before(async () => {
      ({ projectPath } = await generateProject("e2e-upgrade-real", {
        navigationMode: "app-only",
        theme: true,
        zustandStorage: true,
      }));
      initRepository(projectPath);

      // Claim an older origin so the upgrade has a published release to build
      // its "before" snapshot from.
      rewriteManifest(projectPath, { cliVersion: FROM, files: {} });

      // What a project looks like after a few months of work.
      const babel = path.join(projectPath, "babel.config.js");
      fs.writeFileSync(babel, `${fs.readFileSync(babel, "utf8")}\n// our plugin\n`);
      fs.mkdirSync(path.join(projectPath, "src/screens"), { recursive: true });
      fs.writeFileSync(path.join(projectPath, "src/screens/Home.tsx"), "export const Home = () => null;\n");
      git(projectPath, ["add", "-A"]);
      git(projectPath, ["commit", "-m", "team work"]);
    });

    after(() => cleanup(projectPath));

    it("plans without writing under --dry-run", () => {
      const before = fs.readFileSync(path.join(projectPath, "babel.config.js"), "utf8");
      const { status, output } = runCli(["upgrade", "--path", projectPath, "--dry-run"]);

      assert.equal(status, 0);
      assert.match(output, new RegExp(`${FROM} →`));
      assert.match(output, /nothing was written/);
      assert.equal(
        fs.readFileSync(path.join(projectPath, "babel.config.js"), "utf8"),
        before
      );
    });

    it("updates untouched files, merges edited ones and keeps the team's own", () => {
      const { status, output } = runCli([
        "upgrade",
        "--path",
        projectPath,
        "--yes",
      ]);
      assert.equal(status, 0, output);

      // An edit of the team's survives the merge.
      assert.match(
        fs.readFileSync(path.join(projectPath, "babel.config.js"), "utf8"),
        /our plugin/
      );
      // A file the template never produced is never touched.
      assert.equal(
        fs.readFileSync(path.join(projectPath, "src/screens/Home.tsx"), "utf8"),
        "export const Home = () => null;\n"
      );
    });

    it("moves the project onto this version and records a real baseline", () => {
      const manifest = readManifestFile(projectPath);
      const cliVersion = require("../../package.json").version;

      assert.equal(manifest.cliVersion, cliVersion);
      assert.ok(!("adopted" in manifest), "still marked adopted");
      assert.ok(Object.keys(manifest.files).length > 20, "no baseline recorded");
    });

    it("has nothing left to do on a second run", () => {
      git(projectPath, ["add", "-A"]);
      git(projectPath, ["commit", "-m", "upgraded"]);

      const { status, output } = runCli(["upgrade", "--path", projectPath]);
      assert.equal(status, 0);
      assert.match(output, /Already on create-rn-app/);
    });
  }
);
