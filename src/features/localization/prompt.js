const inquirer = require("inquirer");
const chalk = require("chalk");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.localization = {
    enabled: false,
    defaultLanguage: null,
    withRemoteConfig: false,
  };

  if (options.yes) {
    return;
  }

  const { enableLocalization } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableLocalization",
      message:
        "Do you want to set up localization (i18next, react-i18next, i18next-icu, react-native-localize)?",
      default: false,
    },
  ]);

  if (!enableLocalization) {
    return;
  }

  const { defaultLanguage } = await inquirer.prompt([
    {
      type: "input",
      name: "defaultLanguage",
      message: "What default language do you want to use? (e.g. ru, en, ar)",
      default: "ru",
      validate: input => {
        const lang = String(input || "").trim();
        if (!/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/.test(lang)) {
          return "Please enter a valid language code (e.g. ru, en, ar, pt-BR)";
        }
        return true;
      },
      filter: input => String(input || "").trim(),
    },
  ]);

  const firebaseConfig = config.firebase || {};
  const firebaseRemoteConfigEnabled =
    firebaseConfig?.enabled &&
    firebaseConfig?.modules?.includes("remote-config");

  const { withRemoteConfig } = await inquirer.prompt([
    {
      type: "confirm",
      name: "withRemoteConfig",
      message: firebaseRemoteConfigEnabled
        ? "Do you want to use localization together with Remote Config?"
        : "Do you want to use localization together with Remote Config? (⚠️  Note: Firebase Remote Config is not enabled. Please enable it first or this feature won't work.)",
      default: false,
    },
  ]);

  if (withRemoteConfig && !firebaseRemoteConfigEnabled) {
    console.log(
      chalk.yellow(
        "⚠️  Warning: Localization with Remote Config requires Firebase Remote Config to be enabled."
      )
    );
    console.log(
      chalk.yellow(
        "    The integration code will be added, but you'll need to enable Firebase Remote Config for it to work."
      )
    );
  }

  config.localization = {
    enabled: true,
    defaultLanguage,
    withRemoteConfig,
  };

  if (!config.zustandStorage) {
    const { enableZustandForLocalization } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableZustandForLocalization",
        message:
          "Localization requires storage to persist language selection. Do you want to enable Zustand storage? (If no, we'll use a simple context without persistence)",
        default: true,
      },
    ]);

    if (enableZustandForLocalization) {
      config.zustandStorage = true;
    }
  }
}

module.exports = { prompt };
