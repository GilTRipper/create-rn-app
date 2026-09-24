const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateProject, cleanup } = require("../helpers/generate");
const { MANIFEST_FILENAME } = require("../../src/manifest");

const cliPath = path.join(__dirname, "../../bin/cli.js");

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

describe("CLI subcommands: discovery", () => {
  it("lists the subcommands in --help", () => {
    const { output } = runCli(["--help"]);
    assert.match(output, /features/);
    assert.match(output, /healthcheck/);
  });

  it("gives each subcommand its own help with --path", () => {
    for (const command of ["features", "healthcheck"]) {
      const { output } = runCli([command, "--help"]);
      assert.match(output, /--path <path>/, `${command} help`);
    }
  });
});

describe("CLI subcommands: on a generated project", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-commands", {
      navigationMode: "with-auth",
      theme: true,
      uiKit: { enabled: true, components: ["turbo-image"] },
    }));
  });

  after(() => cleanup(projectPath));

  it("features reports what is installed, addable and locked", () => {
    const { status, output } = runCli(["features", "--path", projectPath]);
    assert.equal(status, 0);

    const installed = output.slice(
      output.indexOf("Installed"),
      output.indexOf("Can be added")
    );
    assert.match(installed, /navigation/);
    assert.match(installed, /theme/);
    assert.match(installed, /ui-kit/);
    // Auth is apply-only; it must never show up as something to pick. Only the
    // id column counts - "auth" also appears inside navigation's description.
    assert.ok(
      !/^\s+[✓+−]\s+auth\s/m.test(output),
      "auth leaked into the listing"
    );

    const addable = output.slice(output.indexOf("Can be added"));
    assert.match(addable, /firebase/);
    assert.match(addable, /localization/);
    // Each addable feature carries a ready-to-paste command for this project.
    assert.ok(
      addable.includes(`→ create-rn-app add firebase --path ${projectPath}`),
      "no add hint for firebase"
    );
    assert.ok(!installed.includes("→ create-rn-app add"), "hint on installed");

    assert.match(output, /Not available for an existing project/);
    assert.match(output, /environments/);
  });

  it("healthcheck reports versions, features and a clean file tree", () => {
    const { status, output } = runCli(["healthcheck", "--path", projectPath]);
    assert.equal(status, 0);

    assert.match(output, /Created with\s+create-rn-app/);
    assert.match(output, /React Native\s+0\.\d+/);
    assert.match(output, /up to date/);
    assert.match(output, /tracked, 0 changed, 0 deleted/);
  });

  it("healthcheck notices edited, deleted and user-added files", () => {
    fs.appendFileSync(path.join(projectPath, "App.tsx"), "\n// edited\n");
    fs.rmSync(path.join(projectPath, "GradientText.tsx"), { force: true });
    fs.writeFileSync(path.join(projectPath, "src/mine.ts"), "export {};\n");

    const { status, output } = runCli(["healthcheck", "--path", projectPath]);
    assert.equal(status, 0);
    assert.match(output, /1 changed, 1 deleted/);
    assert.match(output, /~ App\.tsx/);
    assert.match(output, /− GradientText\.tsx/);
    assert.match(output, /file\(s\) are yours, not from the template/);
  });

  it("healthcheck refuses to guess when the manifest is broken", () => {
    fs.writeFileSync(path.join(projectPath, MANIFEST_FILENAME), "{ not json");
    const { status, output } = runCli(["healthcheck", "--path", projectPath]);
    assert.equal(status, 1);
    assert.match(output, /not valid JSON/);
  });
});

describe("CLI subcommands: outside a generated project", () => {
  let emptyDir;

  before(() => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-no-manifest-"));
  });

  after(() => fs.rmSync(emptyDir, { recursive: true, force: true }));

  it("features still prints the catalog without statuses", () => {
    const { status, output } = runCli(["features", "--path", emptyDir]);
    assert.equal(status, 0);
    assert.match(output, /Catalog only/);
    assert.match(output, /firebase/);
    assert.ok(!output.includes("Installed"), "should not claim anything");
    assert.match(output, /create-rn-app adopt --path/);
  });

  it("healthcheck exits 1 and says why", () => {
    const { status, output } = runCli(["healthcheck", "--path", emptyDir]);
    assert.equal(status, 1);
    assert.match(output, new RegExp(`No ${MANIFEST_FILENAME.replace(".", "\\.")}`));
    assert.match(output, /not created by create-rn-app/);
    assert.ok(
      output.includes(`create-rn-app adopt --path ${emptyDir}`),
      "no adopt hint"
    );
  });
});
