const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readJson, readText, readAppDelegate } = require("../helpers/fs");

describe("maps: react-native-maps without Google", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-maps-rn", {
      maps: { enabled: true, provider: "react-native-maps" },
    }));
  });

  after(() => cleanup(projectPath));

  it("keeps react-native-maps and strips Google Maps native bits", () => {
    const pkg = readJson(projectPath, "package.json");
    assert.ok(pkg.dependencies["react-native-maps"]);
    assert.ok(!readText(projectPath, "ios/Podfile").includes("react-native-maps/Google"));

    const appDelegate = readAppDelegate(projectPath);
    assert.ok(!appDelegate.includes("import GoogleMaps"));
    assert.ok(!appDelegate.includes("GMSServices.provideAPIKey"));
  });
});

describe("maps: Google Maps without an API key", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-maps-google-nokey", {
      maps: { enabled: true, provider: "google-maps" },
    }));
  });

  after(() => cleanup(projectPath));

  it("keeps placeholders and the Google Maps pod", () => {
    const appDelegate = readAppDelegate(projectPath);
    assert.ok(appDelegate.includes("import GoogleMaps"));
    assert.ok(appDelegate.includes("<GOOGLE_MAPS_API_KEY>"));
    assert.ok(readText(projectPath, "ios/Podfile").includes("react-native-maps/Google"));

    const manifest = readText(projectPath, "android/app/src/main/AndroidManifest.xml");
    assert.ok(manifest.includes("<!-- Google Maps API Key -->"));
    assert.ok(manifest.includes("<!-- <meta-data"));
  });
});

describe("maps: Google Maps with an API key", () => {
  const apiKey = "TEST_API_KEY_12345";
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-maps-google-key", {
      maps: {
        enabled: true,
        provider: "google-maps",
        googleMapsApiKey: apiKey,
      },
    }));
  });

  after(() => cleanup(projectPath));

  it("injects the key on iOS and Android", () => {
    const appDelegate = readAppDelegate(projectPath);
    assert.ok(appDelegate.includes(`GMSServices.provideAPIKey("${apiKey}")`));
    assert.ok(!appDelegate.includes("<GOOGLE_MAPS_API_KEY>"));

    const manifest = readText(projectPath, "android/app/src/main/AndroidManifest.xml");
    assert.ok(manifest.includes(`android:value="${apiKey}"`));
    assert.ok(
      !/<!-- <meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"/.test(manifest)
    );
  });
});

function assertMapboxNative(projectPath) {
  const pkg = readJson(projectPath, "package.json");
  assert.ok(pkg.dependencies["@rnmapbox/maps"]);
  assert.equal(pkg.dependencies["react-native-maps"], undefined);
  assert.equal(pkg.dependencies["react-native-maps-directions"], undefined);

  assert.ok(exists(projectPath, "src/map/index.ts"));
  assert.ok(exists(projectPath, "src/map/components/MapView.tsx"));
  assert.ok(readText(projectPath, "src/map/components/MapView.tsx").includes("@rnmapbox/maps"));

  const podfile = readText(projectPath, "ios/Podfile");
  assert.ok(podfile.includes("@rnmapbox/maps/scripts/autolinking"));
  assert.ok(podfile.includes("$RNMapboxMaps.pre_install"));
  assert.ok(podfile.includes("$RNMapboxMaps.post_install"));
  assert.ok(!podfile.includes("react-native-maps/Google"));

  const appDelegate = readAppDelegate(projectPath);
  assert.ok(!appDelegate.includes("import GoogleMaps"));
  assert.ok(!appDelegate.includes("GMSServices.provideAPIKey"));

  assert.ok(
    readText(projectPath, "android/build.gradle").includes(
      "api.mapbox.com/downloads/v2/releases/maven"
    )
  );
}

describe("maps: Mapbox without a token", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-maps-mapbox", {
      maps: { enabled: true, provider: "mapbox" },
    }));
  });

  after(() => cleanup(projectPath));

  it("installs @rnmapbox/maps, copies src/map, and uses the token placeholder", () => {
    assertMapboxNative(projectPath);

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes('import Mapbox from "@rnmapbox/maps"'));
    assert.ok(app.includes('Mapbox.setAccessToken("<MAPBOX_ACCESS_TOKEN>")'));
    assert.equal(app.match(/Mapbox\.setAccessToken\(/g).length, 1);
  });
});

describe("maps: Mapbox with a token", () => {
  const token = "pk.test_mapbox_token_12345";
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-maps-mapbox-token", {
      maps: { enabled: true, provider: "mapbox", mapboxToken: token },
    }));
  });

  after(() => cleanup(projectPath));

  it("writes the access token in App.tsx", () => {
    assertMapboxNative(projectPath);

    const app = readText(projectPath, "App.tsx");
    assert.ok(app.includes(`Mapbox.setAccessToken("${token}")`));
    assert.ok(!app.includes("<MAPBOX_ACCESS_TOKEN>"));
    assert.equal(app.match(/Mapbox\.setAccessToken\(/g).length, 1);
  });
});
