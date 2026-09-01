const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readText } = require("../helpers/fs");

describe("navigation: app-only", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-nav-app", {
      navigationMode: "app-only",
    }));
  });

  after(() => cleanup(projectPath));

  it("copies AppNavigator and wires it in App.tsx", () => {
    assert.ok(exists(projectPath, "src/ui/navigation/AppNavigator.tsx"));
    assert.ok(exists(projectPath, "src/ui/navigation/types.ts"));
    assert.ok(exists(projectPath, "src/ui/navigation/index.ts"));
    assert.equal(exists(projectPath, "src/ui/navigation/RootNavigator.tsx"), false);
    assert.equal(exists(projectPath, "src/ui/navigation/AuthNavigator.tsx"), false);
    assert.equal(exists(projectPath, "src/auth"), false);

    const types = readText(projectPath, "src/ui/navigation/types.ts");
    assert.ok(types.includes("export const enum AppRoutes"));
    assert.ok(!types.includes("export const enum RootRoutes"));
    assert.ok(!types.includes("export const enum AuthRoutes"));

    const index = readText(projectPath, "src/ui/navigation/index.ts");
    assert.ok(index.includes("export { AppNavigator }"));
    assert.ok(!index.includes("RootNavigator"));

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes("import { AppNavigator }"));
    assert.ok(app.includes("<AppNavigator />"));
    assert.ok(app.includes("NavigationContainer"));
    assert.ok(!app.includes("RootNavigator"));
  });
});

describe("navigation: with-auth", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-nav-auth", {
      navigationMode: "with-auth",
    }));
  });

  after(() => cleanup(projectPath));

  it("copies auth + root navigators and auto-enables storage", () => {
    for (const file of [
      "src/ui/navigation/AppNavigator.tsx",
      "src/ui/navigation/RootNavigator.tsx",
      "src/ui/navigation/AuthNavigator.tsx",
      "src/ui/navigation/types.ts",
      "src/auth/store/index.ts",
      "src/auth/types.ts",
      "src/auth/index.ts",
      "src/lib/storage.ts",
    ]) {
      assert.ok(exists(projectPath, file), `missing ${file}`);
    }

    const types = readText(projectPath, "src/ui/navigation/types.ts");
    assert.ok(types.includes("export const enum RootRoutes"));
    assert.ok(types.includes("export const enum AuthRoutes"));
    assert.ok(types.includes("export const enum AppRoutes"));

    const index = readText(projectPath, "src/ui/navigation/index.ts");
    assert.ok(index.includes("export { RootNavigator }"));

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes("import { RootNavigator }"));
    assert.ok(app.includes("<RootNavigator />"));
    assert.ok(app.includes("NavigationContainer"));

    const store = readText(projectPath, "src/auth/store/index.ts");
    assert.ok(store.includes("import { zustandStorage }"));
    assert.ok(store.includes("createJSONStorage(() => zustandStorage)"));
    assert.ok(store.includes("export const useAuthStore"));
    assert.ok(store.includes("export const useIsAuthorized"));
  });
});
