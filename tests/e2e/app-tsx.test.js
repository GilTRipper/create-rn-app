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
const { exists, readText } = require("../helpers/fs");

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

describe("App.tsx: theme + localization", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-app-theme-i18n", {
      theme: true,
      localization: { enabled: true, defaultLanguage: "en" },
    }));
  });

  after(() => cleanup(projectPath));

  it("nests ThemeProvider around LocalizationProvider around AppContent", () => {
    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes('import { ThemeProvider } from "~/lib/theme"'));
    assert.ok(
      app.includes('import { LocalizationProvider, useLocalization } from "~/lib/localization"')
    );
    assert.ok(app.includes("initLocalization()"));
    assert.match(
      app,
      /<ThemeProvider>\s*<LocalizationProvider>\s*<AppContent \/>\s*<\/LocalizationProvider>\s*<\/ThemeProvider>/
    );
    assert.ok(!app.includes("@rnmapbox/maps"));
    assert.ok(!app.includes("useHandlePushNotificationToken"));
  });
});

describe("App.tsx: navigation + messaging", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("e2e-app-nav-msg-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-app-nav-msg", {
      navigationMode: "app-only",
      firebase: { ...productionFirebase(configDir), modules: ["messaging"] },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("wires AppNavigator with useHandlePushNotificationToken", () => {
    assert.ok(exists(projectPath, "src/notifications/hooks/useHandlePushNotificationToken.ts"));
    assert.ok(exists(projectPath, "src/ui/navigation/AppNavigator.tsx"));

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes('import { AppNavigator } from "~/ui/navigation"'));
    assert.ok(app.includes("<AppNavigator />"));
    assert.ok(app.includes("NavigationContainer"));
    assert.ok(
      app.includes('import { useHandlePushNotificationToken } from "~/notifications"')
    );
    assert.ok(app.includes("useHandlePushNotificationToken()"));
    assert.ok(app.includes("setNotifications()"));
    assert.ok(!app.includes("RootNavigator"));
  });
});

describe("App.tsx: mapbox + theme", () => {
  const token = "pk.test_mapbox_combo_token";
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-app-mapbox-theme", {
      theme: true,
      maps: { enabled: true, provider: "mapbox", mapboxToken: token },
    }));
  });

  after(() => cleanup(projectPath));

  it("keeps Mapbox init when ThemeProvider rewrites App.tsx", () => {
    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes('import Mapbox from "@rnmapbox/maps"'));
    assert.ok(app.includes(`Mapbox.setAccessToken("${token}")`));
    assert.ok(!app.includes("<MAPBOX_ACCESS_TOKEN>"));
    assert.equal(app.match(/Mapbox\.setAccessToken\(/g).length, 1);
    assert.ok(app.includes('import { ThemeProvider } from "~/lib/theme"'));
    assert.ok(app.includes("<ThemeProvider>"));
    assert.ok(!app.includes("LocalizationProvider"));
  });
});
