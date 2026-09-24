const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  generateProject,
  cleanup,
  prepareFontsDir,
  prepareIconsDirWithEnvs,
} = require("../helpers/generate");
const { manifestPath } = require("../../src/manifest");

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

function git(projectPath, args) {
  execFileSync("git", args, { cwd: projectPath, stdio: "ignore" });
}

function commitAll(projectPath, message) {
  git(projectPath, ["add", "-A"]);
  git(projectPath, ["commit", "-m", message]);
}

function initRepository(projectPath) {
  git(projectPath, ["init", "-q"]);
  git(projectPath, ["config", "user.email", "test@example.com"]);
  git(projectPath, ["config", "user.name", "Test"]);
  commitAll(projectPath, "initial");
}

function readManifestFile(projectPath) {
  return JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
}

function sha1(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function read(projectPath, relative) {
  return fs.readFileSync(path.join(projectPath, relative), "utf8");
}

describe("add: refusals", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-add-refuse", {
      navigationMode: "app-only",
    }));
    initRepository(projectPath);
  });

  after(() => cleanup(projectPath));

  it("refuses a feature that cannot be added to an existing project", () => {
    const { status, output } = runCli([
      "add",
      "environments",
      "--path",
      projectPath,
      "--yes",
    ]);
    assert.equal(status, 1);
    assert.match(output, /cannot be added/);
    assert.match(output, /Xcode project/);
  });

  it("refuses an unknown feature and lists the real ones", () => {
    const { status, output } = runCli(["add", "nonsense", "--path", projectPath]);
    assert.equal(status, 1);
    assert.match(output, /Unknown feature "nonsense"/);
    assert.match(output, /Addable:/);
  });

  // Every write has to be undoable with git, which is a better undo than any
  // backup directory this CLI could invent.
  it("refuses to write into a dirty working tree", () => {
    fs.appendFileSync(path.join(projectPath, "App.tsx"), "\n// uncommitted\n");
    try {
      const { status, output } = runCli([
        "add",
        "storage",
        "--path",
        projectPath,
        "--yes",
      ]);
      assert.equal(status, 1);
      assert.match(output, /Commit or stash/);
    } finally {
      git(projectPath, ["checkout", "--", "."]);
    }
  });

  it("refuses a feature that is already set up", () => {
    const { status, output } = runCli([
      "add",
      "navigation",
      "--path",
      projectPath,
      "--yes",
    ]);
    assert.equal(status, 1);
    assert.match(output, /already set up/);
  });

  it("refuses a project with no manifest and points at adopt", () => {
    fs.rmSync(manifestPath(projectPath));
    try {
      const { status, output } = runCli([
        "add",
        "storage",
        "--path",
        projectPath,
        "--yes",
      ]);
      assert.equal(status, 1);
      assert.match(output, /adopt/);
    } finally {
      git(projectPath, ["checkout", "--", "."]);
    }
  });
});

describe("add: storage on an untouched project", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-add-storage", {
      navigationMode: "app-only",
    }));
    initRepository(projectPath);
  });

  after(() => cleanup(projectPath));

  it("writes nothing with --dry-run", () => {
    const { status, output } = runCli([
      "add",
      "storage",
      "--path",
      projectPath,
      "--dry-run",
      "--yes",
    ]);
    assert.equal(status, 0);
    assert.match(output, /src\/lib\/storage\.ts/);
    assert.match(output, /nothing was written/);
    assert.equal(fs.existsSync(path.join(projectPath, "src/lib/storage.ts")), false);
  });

  it("creates the feature's files and records the choice", () => {
    const { status } = runCli(["add", "storage", "--path", projectPath, "--yes"]);
    assert.equal(status, 0);

    assert.ok(fs.existsSync(path.join(projectPath, "src/lib/storage.ts")));
    assert.equal(readManifestFile(projectPath).config.zustandStorage, true);
  });

  it("records the baseline for what it wrote", () => {
    const manifest = readManifestFile(projectPath);
    assert.equal(
      manifest.files["src/lib/storage.ts"],
      sha1(read(projectPath, "src/lib/storage.ts"))
    );
  });

  it("leaves the rest of the project alone", () => {
    const changed = execFileSync("git", ["status", "--porcelain"], {
      cwd: projectPath,
      encoding: "utf8",
    })
      .split("\n")
      .map(line => line.slice(3).trim())
      .filter(Boolean)
      .sort();

    // git collapses the untracked additions to src/lib/, since src/ui already
    // exists and is committed.
    assert.deepEqual(changed, [".create-rn-app.json", "src/lib/"]);
  });
});

describe("add: theme onto a project whose App.tsx was edited", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-add-theme", {
      navigationMode: "app-only",
      zustandStorage: true,
    }));
    initRepository(projectPath);

    // What any real project looks like by the time someone runs `add`.
    const app = read(projectPath, "App.tsx").replace(
      'import { useEffect } from "react";',
      'import { useEffect } from "react";\nimport { Analytics } from "~/lib/analytics";'
    );
    fs.writeFileSync(path.join(projectPath, "App.tsx"), app);
    commitAll(projectPath, "team edit");
  });

  after(() => cleanup(projectPath));

  it("keeps the team's code and adds the provider", () => {
    const { status, output } = runCli([
      "add",
      "theme",
      "--path",
      projectPath,
      "--yes",
    ]);
    assert.equal(status, 0);
    assert.match(output, /App\.tsx\s+merged/);

    const app = read(projectPath, "App.tsx");
    assert.match(app, /import \{ Analytics \} from "~\/lib\/analytics";/);
    assert.match(app, /<ThemeProvider>/);
    assert.match(app, /<AppContent \/>/);
    assert.ok(!app.includes("<<<<<<<"), "merge left conflict markers");
  });

  // The bug this catches shipped for real: contentJsx is a whole `return`
  // statement, and dropping it inside a provider turns "return (" into JSX
  // text. The file compiles, lint passes, and React Native throws "Text
  // strings must be rendered within a <Text> component" at launch.
  it("produces an App.tsx with no return statement nested in JSX", () => {
    const app = read(projectPath, "App.tsx");
    const returnStatements = (app.match(/^\s*return[\s(]/gm) || []).length;
    assert.equal(returnStatements, 1, app);
  });

  // The baseline is what a clean generation would produce, never what landed on
  // disk. The merged file keeps the team's edits, so it has to stay marked as
  // diverged - otherwise the next upgrade would treat it as untouched template
  // output and overwrite it.
  it("records the template's version as the baseline, not the merged file", () => {
    const manifest = readManifestFile(projectPath);
    const onDisk = sha1(read(projectPath, "App.tsx"));

    assert.ok(manifest.files["App.tsx"], "App.tsx has no baseline");
    assert.notEqual(
      manifest.files["App.tsx"],
      onDisk,
      "baseline must not be the hash of the merged file"
    );
  });

  it("brings the feature's files with it", () => {
    for (const file of [
      "src/lib/theme/index.ts",
      "src/lib/theme/provider.tsx",
      "src/lib/theme/themes.ts",
    ]) {
      assert.ok(fs.existsSync(path.join(projectPath, file)), `missing ${file}`);
    }
  });
});

// Adding several features one after another is the realistic path, and each
// one merges into an App.tsx the previous one already rewrote.
describe("add: every addable feature, one after another", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-add-chain"));
    initRepository(projectPath);
  });

  after(() => cleanup(projectPath));

  const features = ["navigation", "storage", "theme", "localization", "maps", "firebase"];

  for (const feature of features) {
    it(`adds ${feature}`, () => {
      const { status, output } = runCli([
        "add",
        feature,
        "--path",
        projectPath,
        "--yes",
      ]);
      assert.equal(status, 0, output);
      commitAll(projectPath, `add ${feature}`);
    });
  }

  it("leaves an App.tsx with no nested return and no conflict markers", () => {
    const app = read(projectPath, "App.tsx");
    assert.equal((app.match(/^\s*return[\s(]/gm) || []).length, 1, app);
    assert.ok(!app.includes("<<<<<<<"));
  });

  it("records every feature in the manifest", () => {
    const { config } = readManifestFile(projectPath);

    assert.notEqual(config.navigationMode, "none");
    assert.equal(config.zustandStorage, true);
    assert.equal(config.theme, true);
    assert.equal(config.localization.enabled, true);
    assert.equal(config.maps.enabled, true);
    assert.equal(config.firebase.enabled, true);
  });

  it("collects the dependencies each feature brought", () => {
    const pkg = JSON.parse(read(projectPath, "package.json"));
    for (const dependency of [
      "react-native-maps",
      "@react-native-firebase/app",
      "react-i18next",
    ]) {
      assert.ok(pkg.dependencies[dependency], `missing ${dependency}`);
    }
  });

  // Registering GoogleService-Info.plist rewrites project.pbxproj with this
  // project's own object ids, so it cannot come from a snapshot - the feature's
  // own applyNative step has to run against the real project.
  it("ran the Xcode step that no snapshot could provide", () => {
    const iosDir = path.join(projectPath, "ios");
    const xcodeproj = fs
      .readdirSync(iosDir)
      .find(entry => entry.endsWith(".xcodeproj"));
    const pbxproj = fs.readFileSync(
      path.join(iosDir, xcodeproj, "project.pbxproj"),
      "utf8"
    );
    assert.match(pbxproj, /GoogleService-Info\.plist/);
  });

  it("never leaves a merge unresolved anywhere in the project", () => {
    const offenders = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".git", "Pods", "build"].includes(entry.name)) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx|js|swift|gradle|json)$/.test(entry.name)) {
          if (fs.readFileSync(full, "utf8").includes("<<<<<<<")) {
            offenders.push(path.relative(projectPath, full));
          }
        }
      }
    };
    walk(projectPath);
    assert.deepEqual(offenders, []);
  });
});

// Assets never go through the snapshot lane: their sources are local paths the
// manifest deliberately does not record, and the work is copying binaries and
// rewriting files full of this project's own generated ids.
describe("add: assets", () => {
  let projectPath;
  const envs = ["development", "staging"];

  before(async () => {
    ({ projectPath } = await generateProject("e2e-add-assets", {
      bundleIdentifier: "com.test.e2eaddassets",
      envSetupSelectedEnvs: envs,
    }));
    initRepository(projectPath);
  });

  after(() => cleanup(projectPath));

  it("refuses when no asset directory was given", () => {
    const { status, output } = runCli(["add", "assets", "--path", projectPath]);
    assert.equal(status, 1);
    assert.match(output, /--fonts-dir/);
    assert.match(output, /--app-icon-dir/);
  });

  it("reports the per-environment layout in --dry-run without writing", () => {
    const { status, output } = runCli([
      "add",
      "assets",
      "--path",
      projectPath,
      "--app-icon-dir",
      prepareIconsDirWithEnvs(envs, ["qa"]),
      "--dry-run",
    ]);

    assert.equal(status, 0);
    assert.match(output, /shared set for every environment/);
    assert.match(output, /development: its own icon set/);
    assert.match(output, /qa\/ matches no environment/);

    // Flavour directories already exist - environments/android.js copies main
    // into each of them at generation time - so the proof that nothing was
    // written is the absence of the per-environment iOS icon set.
    const iosDir = path.join(projectPath, "ios");
    const appDir = fs
      .readdirSync(iosDir)
      .find(entry => fs.existsSync(path.join(iosDir, entry, "Images.xcassets")));
    assert.equal(
      fs.existsSync(
        path.join(iosDir, appDir, "Images.xcassets", "AppIconDevelopment.appiconset")
      ),
      false
    );
  });

  it("copies icons per environment and wires the Xcode targets", () => {
    const { status } = runCli([
      "add",
      "assets",
      "--path",
      projectPath,
      "--app-icon-dir",
      prepareIconsDirWithEnvs(envs),
    ]);
    assert.equal(status, 0);

    for (const env of envs) {
      assert.ok(
        fs.existsSync(
          path.join(projectPath, `android/app/src/${env}/res/mipmap-hdpi/ic_launcher.png`)
        ),
        `no ${env} icons`
      );
    }

    const iosDir = path.join(projectPath, "ios");
    const appDir = fs
      .readdirSync(iosDir)
      .find(entry => fs.existsSync(path.join(iosDir, entry, "Images.xcassets")));
    const sets = fs
      .readdirSync(path.join(iosDir, appDir, "Images.xcassets"))
      .filter(name => name.endsWith(".appiconset"));
    assert.deepEqual(sets.sort(), [
      "AppIcon.appiconset",
      "AppIconDevelopment.appiconset",
      "AppIconStaging.appiconset",
    ]);
  });

  it("records that custom icons exist without recording where they came from", () => {
    const manifest = readManifestFile(projectPath);

    assert.equal(manifest.config.assets.appIcon, true);
    for (const key of ["fontsDir", "splashScreenDir", "appIconDir"]) {
      assert.ok(!(key in manifest.config), `${key} leaked into the manifest`);
    }
  });

  // Assets are cumulative: fonts can arrive long after icons did.
  it("adds fonts later without complaining that assets already exist", () => {
    commitAll(projectPath, "icons");
    const { status } = runCli([
      "add",
      "assets",
      "--path",
      projectPath,
      "--fonts-dir",
      prepareFontsDir(),
    ]);

    assert.equal(status, 0);
    const manifest = readManifestFile(projectPath);
    assert.equal(manifest.config.assets.fonts, true);
    assert.equal(manifest.config.assets.appIcon, true);
  });
});
