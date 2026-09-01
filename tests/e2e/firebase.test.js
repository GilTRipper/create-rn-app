const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const { generateProject, cleanup, writeDummyFirebaseFiles, uniqueName } = require("../helpers/generate");
const { exists, readJson, readText, readAppDelegate, findIosAppDir } = require("../helpers/fs");

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

describe("firebase analytics", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-analytics-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-fb-analytics", {
      firebase: { ...productionFirebase(configDir), modules: ["analytics"] },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("copies the analytics module and keeps Firebase in AppDelegate", () => {
    for (const file of ["index.ts", "implementation.ts", "interface.ts", "types.ts", "useAnalytics.ts"]) {
      assert.ok(exists(projectPath, "src/lib/analytics", file), `missing ${file}`);
    }
    assert.equal(exists(projectPath, "src/lib/remote-config"), false);

    const index = readText(projectPath, "src/lib/analytics/index.ts");
    assert.ok(index.includes('export * from "./useAnalytics"'));
    assert.ok(index.includes('export * from "./implementation"'));

    const hook = readText(projectPath, "src/lib/analytics/useAnalytics.ts");
    assert.ok(hook.includes("export const useAnalytics"));
    assert.ok(hook.includes('from "@react-native-firebase/app"'));
    assert.ok(hook.includes("getApp("));

    const impl = readText(projectPath, "src/lib/analytics/implementation.ts");
    assert.ok(impl.includes("class Analytics"));
    assert.ok(impl.includes("logEvent("));
    assert.ok(impl.includes("setUserId("));
    assert.ok(impl.includes("setUserProperties("));

    const iface = readText(projectPath, "src/lib/analytics/interface.ts");
    assert.ok(iface.includes("logEvent("));
    assert.ok(iface.includes("setUserId("));

    const appDelegate = readAppDelegate(projectPath);
    assert.ok(appDelegate.includes("import Firebase"));
    assert.ok(appDelegate.includes("FirebaseApp.configure()"));
    assert.ok(!appDelegate.includes("import GoogleMaps"));
  });
});

describe("firebase remote-config", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-rc-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-fb-rc", {
      firebase: { ...productionFirebase(configDir), modules: ["remote-config"] },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("copies only remote-config", () => {
    for (const file of [
      "index.ts",
      "implementation.ts",
      "interface.ts",
      "types.ts",
      "useRemoteConfig.ts",
    ]) {
      assert.ok(exists(projectPath, "src/lib/remote-config", file), `missing ${file}`);
    }
    assert.equal(exists(projectPath, "src/lib/analytics"), false);

    const index = readText(projectPath, "src/lib/remote-config/index.ts");
    assert.ok(index.includes("useRemoteConfig"));
    assert.ok(index.includes("RemoteConfig"));

    const hook = readText(projectPath, "src/lib/remote-config/useRemoteConfig.ts");
    assert.ok(hook.includes("export const useRemoteConfig"));
    assert.ok(hook.includes("getApp("));
    assert.ok(hook.includes('from "~/lib/analytics"'));

    const impl = readText(projectPath, "src/lib/remote-config/implementation.ts");
    assert.ok(impl.includes("class RemoteConfig"));
    assert.ok(impl.includes("getAllJSON"));
    assert.ok(impl.includes("getJSON"));
    assert.ok(impl.includes("getString"));
    assert.ok(impl.includes("getBoolean"));
  });
});

describe("firebase analytics + remote-config", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-both-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-fb-both", {
      firebase: {
        ...productionFirebase(configDir),
        modules: ["analytics", "remote-config"],
      },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("copies both lib modules", () => {
    assert.ok(exists(projectPath, "src/lib/analytics/index.ts"));
    assert.ok(exists(projectPath, "src/lib/remote-config/index.ts"));
  });
});

describe("firebase messaging", () => {
  const configDir = path.join(os.tmpdir(), uniqueName("firebase-msg-cfg"));
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-fb-msg", {
      firebase: { ...productionFirebase(configDir), modules: ["messaging"] },
    }));
  });

  after(() => {
    cleanup(projectPath);
    cleanup(configDir);
  });

  it("adds messaging deps, notifications preset, and native permission bits", () => {
    const deps = readJson(projectPath, "package.json").dependencies;
    assert.ok(deps["@react-native-firebase/messaging"]);
    assert.ok(String(deps["@react-native-firebase/app"] || "").startsWith("^26."));
    assert.ok(readText(projectPath, "ios/Podfile").includes("$RNFirebaseDisableSPM = true"));

    for (const file of [
      "index.ts",
      "interface.ts",
      "service.ts",
      "hooks/index.ts",
      "hooks/usePushNotifications.ts",
      "hooks/useHandlePushNotificationToken.ts",
    ]) {
      assert.ok(exists(projectPath, "src/notifications", file), `missing ${file}`);
    }

    const notificationsIndex = readText(projectPath, "src/notifications/index.ts");
    assert.ok(notificationsIndex.includes("useHandlePushNotificationToken"));
    assert.ok(notificationsIndex.includes("usePushNotifications"));

    const handleToken = readText(
      projectPath,
      "src/notifications/hooks/useHandlePushNotificationToken.ts"
    );
    assert.ok(handleToken.includes("export const useHandlePushNotificationToken"));
    assert.ok(handleToken.includes("setNotifications"));
    assert.ok(handleToken.includes("getPushToken"));

    const service = readText(projectPath, "src/notifications/service.ts");
    assert.ok(service.includes("requestPermission"));
    assert.ok(service.includes("getPushToken"));
    assert.ok(service.includes("checkPermission"));

    const manifest = readText(projectPath, "android/app/src/main/AndroidManifest.xml");
    assert.ok(
      manifest.includes('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />')
    );

    const appDir = findIosAppDir(projectPath);
    const info = readText(projectPath, "ios", appDir, "Info.plist");
    assert.ok(info.includes("<key>UIBackgroundModes</key>"));
    assert.ok(info.includes("<string>remote-notification</string>"));
  });
});
