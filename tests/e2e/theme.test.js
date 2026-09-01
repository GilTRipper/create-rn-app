const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readText } = require("../helpers/fs");

const themeFiles = ["index.ts", "provider.tsx", "types.ts", "themes.ts", "store/index.ts"];

describe("theme without Zustand", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-theme", { theme: true }));
  });

  after(() => cleanup(projectPath));

  it("copies the theme preset and wraps App.tsx without storage", () => {
    for (const file of themeFiles) {
      assert.ok(exists(projectPath, "src/lib/theme", file), `missing ${file}`);
    }
    assert.equal(exists(projectPath, "src/lib/storage.ts"), false);

    const provider = readText(projectPath, "src/lib/theme/provider.tsx");
    assert.ok(!provider.includes("useThemeStore"));
    assert.ok(provider.includes("useState("));
    assert.ok(readText(projectPath, "App.tsx").includes("ThemeProvider"));
  });
});

describe("theme with Zustand", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-theme-store", {
      theme: true,
      zustandStorage: true,
    }));
  });

  after(() => cleanup(projectPath));

  it("persists theme through the Zustand store", () => {
    assert.ok(exists(projectPath, "src/lib/storage.ts"));
    const store = readText(projectPath, "src/lib/theme/store/index.ts");
    assert.ok(store.includes('from "zustand"'));
    assert.ok(store.includes("persist("));
    assert.ok(store.includes("useThemeStore"));
    assert.ok(readText(projectPath, "src/lib/theme/provider.tsx").includes("useThemeStore"));
  });
});
