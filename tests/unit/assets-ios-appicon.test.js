const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  setAppIconNamesForEnvs,
  appIconSetName,
} = require("../../src/features/assets/ios-appicon");

const PROJECT = "MyApp";

// The shape createIosTargetsForEnvs produces: one build configuration block per
// target per configuration, each pointing INFOPLIST_FILE at its own plist.
function buildSettingsBlock(infoPlist, { appIcon = "AppIcon" } = {}) {
  return [
    "\t\t\tbuildSettings = {",
    `\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = ${appIcon};`,
    "\t\t\t\tCURRENT_PROJECT_VERSION = 1;",
    `\t\t\t\tINFOPLIST_FILE = ${infoPlist};`,
    "\t\t\t\tPRODUCT_NAME = MyApp;",
    "\t\t\t};",
  ].join("\n");
}

function pbxproj(blocks) {
  return `// !$*UTF8*$!\n{\n${blocks.join("\n")}\n}\n`;
}

async function withProject(content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crna-appicon-"));
  const xcodeproj = path.join(dir, "ios", `${PROJECT}.xcodeproj`);
  fs.mkdirSync(xcodeproj, { recursive: true });
  const pbxprojPath = path.join(xcodeproj, "project.pbxproj");
  fs.writeFileSync(pbxprojPath, content);

  try {
    return await run(dir, () => fs.readFileSync(pbxprojPath, "utf8"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("assets/ios-appicon", () => {
  it("names the set after the environment", () => {
    assert.equal(appIconSetName("development"), "AppIconDevelopment");
    assert.equal(appIconSetName("staging"), "AppIconStaging");
  });

  it("points only the environment's own configurations at its icon set", async () => {
    const content = pbxproj([
      buildSettingsBlock("myapp/Info.plist"),
      buildSettingsBlock("myapp/Info.plist"),
      buildSettingsBlock(`"myapp/${PROJECT} development-Info.plist"`),
      buildSettingsBlock(`"myapp/${PROJECT} development-Info.plist"`),
      buildSettingsBlock(`"myapp/${PROJECT} staging-Info.plist"`),
    ]);

    await withProject(content, async (projectPath, read) => {
      const applied = await setAppIconNamesForEnvs(projectPath, PROJECT, [
        "development",
      ]);
      assert.deepEqual(applied, ["development"]);

      const updated = read();
      const names = updated.match(/ASSETCATALOG_COMPILER_APPICON_NAME = \w+;/g);
      assert.deepEqual(names, [
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;",
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;",
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDevelopment;",
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDevelopment;",
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;",
      ]);
    });
  });

  it("handles several environments in one pass", async () => {
    const content = pbxproj([
      buildSettingsBlock("myapp/Info.plist"),
      buildSettingsBlock(`"myapp/${PROJECT} development-Info.plist"`),
      buildSettingsBlock(`"myapp/${PROJECT} staging-Info.plist"`),
    ]);

    await withProject(content, async (projectPath, read) => {
      const applied = await setAppIconNamesForEnvs(projectPath, PROJECT, [
        "development",
        "staging",
      ]);
      assert.deepEqual(applied.sort(), ["development", "staging"]);

      const updated = read();
      assert.match(updated, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDevelopment;/);
      assert.match(updated, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIconStaging;/);
    });
  });

  // Nothing guarantees the setting is already there, and a target without one
  // falls back to the name "AppIcon" - which would be the wrong set.
  it("adds the setting when a configuration has none", async () => {
    const block = [
      "\t\t\tbuildSettings = {",
      `\t\t\t\tINFOPLIST_FILE = "myapp/${PROJECT} development-Info.plist";`,
      "\t\t\t\tPRODUCT_NAME = MyApp;",
      "\t\t\t};",
    ].join("\n");

    await withProject(pbxproj([block]), async (projectPath, read) => {
      await setAppIconNamesForEnvs(projectPath, PROJECT, ["development"]);
      assert.match(read(), /ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDevelopment;/);
    });
  });

  it("leaves the project untouched when no environment matches", async () => {
    const content = pbxproj([buildSettingsBlock("myapp/Info.plist")]);

    await withProject(content, async (projectPath, read) => {
      const applied = await setAppIconNamesForEnvs(projectPath, PROJECT, ["qa"]);
      assert.deepEqual(applied, []);
      assert.equal(read(), content);
    });
  });

  it("does nothing without environments or without a project file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crna-appicon-"));
    try {
      assert.deepEqual(await setAppIconNamesForEnvs(dir, PROJECT, []), []);
      assert.deepEqual(await setAppIconNamesForEnvs(dir, PROJECT, ["development"]), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
