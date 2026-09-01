const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { UI_KIT_ALL } = require("../../src/ui-templates");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readJson, readText } = require("../helpers/fs");

describe("ui-kit: All", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-ui-all", {
      uiKit: { enabled: true, components: [UI_KIT_ALL] },
    }));
  });

  after(() => cleanup(projectPath));

  it("copies every component and injects dependencies", () => {
    assert.ok(exists(projectPath, "src/ui/components/atoms/TurboImage.tsx"));
    assert.ok(exists(projectPath, "src/ui/components/atoms/LiquidGlassView.tsx"));

    const atomsIndex = readText(projectPath, "src/ui/components/atoms/index.ts");
    assert.ok(atomsIndex.includes("TurboImage"));
    assert.ok(atomsIndex.includes("LiquidGlassView"));
    assert.ok(readText(projectPath, "src/ui/components/index.ts").includes("./atoms"));

    const deps = readJson(projectPath, "package.json").dependencies;
    assert.ok(deps["react-native-turbo-image"]);
    assert.ok(deps["@callstack/liquid-glass"]);
  });
});

describe("ui-kit: TurboImage only", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-ui-turbo", {
      uiKit: { enabled: true, components: ["turbo-image"] },
    }));
  });

  after(() => cleanup(projectPath));

  it("copies only the selected component", () => {
    assert.ok(exists(projectPath, "src/ui/components/atoms/TurboImage.tsx"));
    assert.equal(exists(projectPath, "src/ui/components/atoms/LiquidGlassView.tsx"), false);

    const atomsIndex = readText(projectPath, "src/ui/components/atoms/index.ts");
    assert.ok(atomsIndex.includes("TurboImage"));
    assert.ok(!atomsIndex.includes("LiquidGlassView"));

    const deps = readJson(projectPath, "package.json").dependencies;
    assert.ok(deps["react-native-turbo-image"]);
    assert.equal(deps["@callstack/liquid-glass"], undefined);
  });
});
