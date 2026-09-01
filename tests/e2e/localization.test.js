const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const {
  generateProject,
  cleanup,
  writeDummyFirebaseFiles,
  uniqueName,
} = require("../helpers/generate");
const { exists, readJson, readText } = require("../helpers/fs");

function productionFirebase(configDir) {
  writeDummyFirebaseFiles(configDir);
  return {
    enabled: true,
    googleFiles: {
      filesByEnv: {
        production: {
          iosPlist: path.join(configDir, "GoogleService-Info.plist"),
          androidJson: path.join(configDir, "google-services.json"),
        },
      },
    },
  };
}

describe("localization with Zustand", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-i18n", {
      zustandStorage: true,
      localization: { enabled: true, defaultLanguage: "en" },
    }));
  });

  after(() => cleanup(projectPath));

  it("copies i18n files, deps, storage, and App.tsx wiring", () => {
    const localizationDir = "src/lib/localization";
    for (const file of ["index.ts", "provider.tsx", "types.ts", "store/index.ts"]) {
      assert.ok(exists(projectPath, localizationDir, file), `missing ${file}`);
    }
    assert.ok(exists(projectPath, localizationDir, "languages/en.json"));
    assert.ok(exists(projectPath, "src/lib/storage.ts"));

    const deps = readJson(projectPath, "package.json").dependencies;
    for (const dep of ["i18next", "i18next-icu", "react-i18next"]) {
      assert.ok(deps[dep], `missing ${dep}`);
    }

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes("LocalizationProvider"));
    assert.ok(app.includes("useLocalization"));
  });
});

describe("localization without Zustand", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-i18n-nostore", {
      localization: { enabled: true, defaultLanguage: "ar" },
    }));
  });

  after(() => cleanup(projectPath));

  it("uses in-memory language state and the selected default language", () => {
    assert.equal(exists(projectPath, "src/lib/storage.ts"), false);
    assert.ok(exists(projectPath, "src/lib/localization/provider.tsx"));

    const provider = readText(projectPath, "src/lib/localization/provider.tsx");
    assert.ok(!provider.includes("useLocalizationStore"));
    assert.ok(provider.includes("useState"));
    assert.ok(provider.includes("./languages/ar.json"));

    const store = readText(projectPath, "src/lib/localization/store/index.ts");
    assert.match(store.trim(), /export\s*\{\s*\};?/);
    assert.ok(!store.includes("useLocalizationStore"));
  });
});

describe("localization with Remote Config", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("e2e-i18n-rc-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-i18n-rc", {
      zustandStorage: true,
      localization: {
        enabled: true,
        defaultLanguage: "en",
        withRemoteConfig: true,
      },
      firebase: { ...productionFirebase(configDir), modules: ["remote-config"] },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("builds the Remote Config provider and keeps a local language fallback", () => {
    assert.ok(exists(projectPath, "src/lib/remote-config/useRemoteConfig.ts"));
    assert.ok(exists(projectPath, "src/lib/localization/languages/en.json"));

    const provider = readText(projectPath, "src/lib/localization/provider.tsx");
    assert.ok(provider.includes('import { useRemoteConfig } from "~/lib/remote-config"'));
    assert.ok(provider.includes("useRemoteConfig()"));
    assert.ok(provider.includes("getAllJSON"));
    assert.ok(provider.includes("deepMerge"));
    assert.ok(provider.includes("fallbackLng: false"));
    assert.ok(provider.includes("i18n.options.fallbackLng = false"));
    assert.ok(provider.includes("using local file as fallback"));

    const store = readText(projectPath, "src/lib/localization/store/index.ts");
    assert.ok(store.includes("useLocalizationStore"));
    assert.ok(store.includes('from "zustand"'));
  });
});

