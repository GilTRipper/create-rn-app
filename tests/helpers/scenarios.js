const os = require("os");
const path = require("path");
const { UI_KIT_ALL } = require("../../src/ui-templates");
const {
  firebaseFilesByEnv,
  prepareFontsDir,
  prepareIconsDir,
  prepareSplashDir,
  uniqueName,
} = require("./generate");

// A scenario is one full run of the wizard: the feature combination a user
// actually picks. build() is lazy so the temp asset dirs are only created for
// the scenarios the current run is going to generate.
const SCENARIOS = [
  {
    name: "minimal",
    title: "minimal: template only, every optional feature off",
    build: () => ({ overrides: {}, tempDirs: [] }),
  },
  {
    name: "typical",
    title: "typical: auth navigation, storage, theme, i18n, ui kit, fonts",
    build() {
      const fontsDir = prepareFontsDir();
      return {
        tempDirs: [fontsDir],
        overrides: {
          navigationMode: "with-auth",
          zustandStorage: true,
          theme: true,
          localization: {
            enabled: true,
            defaultLanguage: "en",
            withRemoteConfig: false,
          },
          uiKit: { enabled: true, components: [UI_KIT_ALL] },
          fontsDir,
        },
      };
    },
  },
  {
    name: "full",
    title: "full: three environments, Firebase, Google Maps, every JS feature",
    build() {
      const envs = ["local", "development", "staging"];
      // Fixed so the Google config fixtures can name each flavor's applicationId.
      const bundleIdentifier = "com.test.e2escenariofull";
      const firebaseDir = path.join(os.tmpdir(), uniqueName("e2e-scenario-fb-cfg"));
      const fontsDir = prepareFontsDir();
      const splashScreenDir = prepareSplashDir();
      const appIconDir = prepareIconsDir();

      return {
        tempDirs: [firebaseDir, fontsDir, splashScreenDir, appIconDir],
        overrides: {
          bundleIdentifier,
          envSetupSelectedEnvs: envs,
          firebase: {
            enabled: true,
            modules: ["analytics", "remote-config", "messaging"],
            googleFiles: {
              filesByEnv: firebaseFilesByEnv(
                firebaseDir,
                ["production", ...envs],
                bundleIdentifier
              ),
            },
          },
          maps: {
            enabled: true,
            provider: "google-maps",
            googleMapsApiKey: "SCENARIO_MAPS_KEY",
          },
          zustandStorage: true,
          navigationMode: "with-auth",
          theme: true,
          localization: {
            enabled: true,
            defaultLanguage: "ru",
            withRemoteConfig: true,
          },
          uiKit: { enabled: true, components: [UI_KIT_ALL] },
          fontsDir,
          splashScreenDir,
          appIconDir,
        },
      };
    },
  },
];

function selectedScenarios() {
  const filter = process.env.CREATE_RN_TEST_SCENARIO;
  if (!filter) {
    return SCENARIOS;
  }
  const wanted = filter.split(",").map(name => name.trim()).filter(Boolean);
  const selected = SCENARIOS.filter(scenario => wanted.includes(scenario.name));
  if (selected.length === 0) {
    throw new Error(
      `No scenario matched "${filter}". Available: ${SCENARIOS.map(s => s.name).join(", ")}`
    );
  }
  return selected;
}

module.exports = { SCENARIOS, selectedScenarios };
