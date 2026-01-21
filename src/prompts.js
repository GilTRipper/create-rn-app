const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

async function getPrompts(projectNameArg, options) {
  const questions = [];

  // Ask for project name if not provided
  if (!projectNameArg) {
    questions.push({
      type: "input",
      name: "projectName",
      message: "What is your project name?",
      default: "MyApp",
      validate: input => {
        if (!input || input.trim().length === 0) {
          return "Project name is required";
        }
        return true;
      },
    });
  }

  // Ask for bundle identifier if not provided
  if (!options.bundleId) {
    questions.push({
      type: "input",
      name: "bundleIdentifier",
      message: "What is your bundle identifier?",
      default: answers => {
        const name = projectNameArg || answers.projectName;
        return `com.${name.toLowerCase()}`;
      },
      validate: input => {
        if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(input)) {
          return "Bundle identifier must be in format: com.company.app";
        }
        return true;
      },
    });
  }

  // Ask for display name if not provided
  if (!options.displayName) {
    questions.push({
      type: "input",
      name: "displayName",
      message: "What is your app display name?",
      default: answers => projectNameArg || answers.projectName,
    });
  }

  // Ask for package manager if not provided
  if (!options.packageManager) {
    questions.push({
      type: "list",
      name: "packageManager",
      message: "Which package manager would you like to use?",
      choices: [
        { name: "pnpm (recommended)", value: "pnpm" },
        { name: "npm", value: "npm" },
        { name: "yarn", value: "yarn" },
      ],
      default: "pnpm",
    });
  }

  // Ask about dependency installation
  if (!options.skipInstall && !options.yes) {
    questions.push({
      type: "confirm",
      name: "installDependencies",
      message: "Install dependencies now?",
      default: true,
    });
  }

  // Ask about splash screen images directory if not provided via options and not in non-interactive mode
  if (!options.splashScreenDir && !options.yes) {
    questions.push({
      type: "input",
      name: "splashScreenDir",
      message:
        "Path to directory with splash screen images (optional, press Enter to skip):",
      default: "",
      validate: async input => {
        if (!input || input.trim().length === 0) {
          return true; // Optional, so empty is valid
        }
        const dirPath = path.isAbsolute(input)
          ? input
          : path.join(process.cwd(), input);
        if (!(await fs.pathExists(dirPath))) {
          return "Directory does not exist";
        }
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          return "Path is not a directory";
        }
        return true;
      },
    });
  }

  // Ask about app icon directory if not provided via options and not in non-interactive mode
  if (!options.appIconDir && !options.yes) {
    questions.push({
      type: "input",
      name: "appIconDir",
      message:
        "Path to directory with app icons from appicon.co (optional, press Enter to skip):",
      default: "",
      validate: async input => {
        if (!input || input.trim().length === 0) {
          return true; // Optional, so empty is valid
        }
        const dirPath = path.isAbsolute(input)
          ? input
          : path.join(process.cwd(), input);
        if (!(await fs.pathExists(dirPath))) {
          return "Directory does not exist";
        }
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          return "Path is not a directory";
        }
        return true;
      },
    });
  }

  // Ask about fonts directory if not provided via options and not in non-interactive mode
  if (!options.fontsDir && !options.yes) {
    questions.push({
      type: "input",
      name: "fontsDir",
      message: "Path to directory with fonts (optional, press Enter to skip):",
      default: "",
      validate: async input => {
        if (!input || input.trim().length === 0) {
          return true; // Optional, so empty is valid
        }
        const dirPath = path.isAbsolute(input)
          ? input
          : path.join(process.cwd(), input);
        if (!(await fs.pathExists(dirPath))) {
          return "Directory does not exist";
        }
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          return "Path is not a directory";
        }
        return true;
      },
    });
  }

  const answers = await inquirer.prompt(questions);

  // Environment setup (interactive only)
  let envSetupSelectedEnvs = [];
  if (!options.yes) {
    const envChoices = [
      { name: "local", value: "local" },
      { name: "development", value: "development" },
      { name: "staging", value: "staging" },
      { name: "Cancel", value: "__CANCEL__" },
    ];

    while (true) {
      const { envSelection } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "envSelection",
          message:
            "Configure environments now? Select at least one (or choose Cancel to skip).",
          choices: envChoices,
        },
      ]);

      if (envSelection.includes("__CANCEL__")) {
        envSetupSelectedEnvs = [];
        console.log(chalk.yellow("⏭️  Skipping environment setup"));
        break;
      }

      if (envSelection.length < 1) {
        console.log(
          chalk.red(
            "Please select at least one environment or choose Cancel to skip."
          )
        );
        continue;
      }

      envSetupSelectedEnvs = envSelection;
      break;
    }
  }

  // Firebase setup (interactive only, after env selection)
  let firebaseConfig = {
    enabled: false,
    modules: [],
    googleFiles: {
      filesByEnv: {},
    },
  };

  if (!options.yes) {
    const { enableFirebase } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableFirebase",
        message: "Install Firebase?",
        default: false,
      },
    ]);

    if (enableFirebase) {
      firebaseConfig.enabled = true;

      const { firebaseModules } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "firebaseModules",
          message: "Which Firebase packages do you need?",
          choices: [
            { name: "Analytics", value: "analytics" },
            { name: "Remote Config", value: "remote-config" },
            { name: "Push notifications (Messaging)", value: "messaging" },
          ],
          default: ["analytics"],
        },
      ]);

      firebaseConfig.modules = firebaseModules;

      let envsForFirebase =
        envSetupSelectedEnvs && envSetupSelectedEnvs.length > 0
          ? [...envSetupSelectedEnvs]
          : ["production"];

      // If user selected only one env, allow them to indicate they still have multiple Firebase env configs
      let useMultiEnv = envsForFirebase.length > 1;
      if (!useMultiEnv) {
        const { hasMultiFirebaseEnvs } = await inquirer.prompt([
          {
            type: "confirm",
            name: "hasMultiFirebaseEnvs",
            message:
              "Do you have Google config files for multiple environments (e.g., production + staging)?",
            default: false,
          },
        ]);
        useMultiEnv = hasMultiFirebaseEnvs;

        if (useMultiEnv) {
          // Ensure production is included alongside the selected env
          if (
            !envsForFirebase.some(env => env.toLowerCase() === "production")
          ) {
            envsForFirebase = ["production", ...envsForFirebase];
          }
        }
      }

      const ensureAbsolutePath = input =>
        path.isAbsolute(input)
          ? path.normalize(input)
          : path.normalize(path.join(process.cwd(), input));

      if (!useMultiEnv) {
        const { firebaseSingleDir } = await inquirer.prompt([
          {
            type: "input",
            name: "firebaseSingleDir",
            message:
              "Path to directory containing google-services.json and GoogleService-Info.plist:",
            validate: async input => {
              if (!input || input.trim().length === 0) {
                return "Path is required when Firebase is enabled.";
              }
              const dirPath = ensureAbsolutePath(input);
              if (!(await fs.pathExists(dirPath))) {
                return "Directory does not exist";
              }
              const plistPath = path.join(dirPath, "GoogleService-Info.plist");
              const jsonPath = path.join(dirPath, "google-services.json");
              if (!(await fs.pathExists(plistPath))) {
                return "GoogleService-Info.plist not found in the directory";
              }
              if (!(await fs.pathExists(jsonPath))) {
                return "google-services.json not found in the directory";
              }
              return true;
            },
          },
        ]);

        const dirPath = ensureAbsolutePath(firebaseSingleDir);
        firebaseConfig.googleFiles.filesByEnv[envsForFirebase[0]] = {
          iosPlist: path.join(dirPath, "GoogleService-Info.plist"),
          androidJson: path.join(dirPath, "google-services.json"),
        };
      } else {
        const { firebaseMultiBaseDir } = await inquirer.prompt([
          {
            type: "input",
            name: "firebaseMultiBaseDir",
            message:
              "Path to base directory with per-environment Google config folders:",
            validate: async input => {
              if (!input || input.trim().length === 0) {
                return "Path is required when Firebase is enabled.";
              }
              const baseDir = ensureAbsolutePath(input);
              if (!(await fs.pathExists(baseDir))) {
                return "Directory does not exist";
              }

              for (const env of envsForFirebase) {
                const lowerEnv = env.toLowerCase();
                const iosPath = path.join(
                  baseDir,
                  lowerEnv,
                  "GoogleService-Info.plist"
                );
                const androidEnvFolder =
                  lowerEnv === "production" ? "production" : lowerEnv;
                const androidPath = path.join(
                  baseDir,
                  androidEnvFolder,
                  "google-services.json"
                );

                if (!(await fs.pathExists(iosPath))) {
                  return `Missing GoogleService-Info.plist for ${env} at ${iosPath}`;
                }
                if (!(await fs.pathExists(androidPath))) {
                  return `Missing google-services.json for ${env} at ${androidPath}`;
                }
              }

              return true;
            },
          },
        ]);

        const baseDir = ensureAbsolutePath(firebaseMultiBaseDir);
        for (const env of envsForFirebase) {
          const lowerEnv = env.toLowerCase();
          const androidEnvFolder =
            lowerEnv === "production" ? "production" : lowerEnv;
          firebaseConfig.googleFiles.filesByEnv[env] = {
            iosPlist: path.join(baseDir, lowerEnv, "GoogleService-Info.plist"),
            androidJson: path.join(
              baseDir,
              androidEnvFolder,
              "google-services.json"
            ),
          };
        }
      }
    }
  }

  // Maps setup (interactive only, after Firebase)
  let mapsConfig = {
    enabled: false,
    provider: null,
    googleMapsApiKey: null,
  };

  if (!options.yes) {
    const { mapsSelection } = await inquirer.prompt([
      {
        type: "list",
        name: "mapsSelection",
        message: "Will you be using maps?",
        choices: [
          { name: "react-native-maps", value: "react-native-maps" },
          { name: "Cancel", value: "__CANCEL__" },
        ],
        default: "__CANCEL__",
      },
    ]);

    if (mapsSelection === "react-native-maps") {
      mapsConfig.enabled = true;
      mapsConfig.provider = "react-native-maps";

      // Ask about Google Maps setup
      const { enableGoogleMaps } = await inquirer.prompt([
        {
          type: "confirm",
          name: "enableGoogleMaps",
          message: "Do you want to configure Google Maps?",
          default: false,
        },
      ]);

      if (enableGoogleMaps) {
        mapsConfig.provider = "google-maps";

        // Ask for Google Maps API key
        const { googleMapsApiKey } = await inquirer.prompt([
          {
            type: "input",
            name: "googleMapsApiKey",
            message:
              "Enter your Google Maps API key (or press Enter to skip and configure later):",
            default: "",
          },
        ]);

        if (googleMapsApiKey && googleMapsApiKey.trim().length > 0) {
          mapsConfig.googleMapsApiKey = googleMapsApiKey.trim();
        }
      }
    }
  }

  // Zustand storage setup (interactive only, after Maps)
  let zustandStorageEnabled = false;

  if (!options.yes) {
    const { enableZustandStorage } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableZustandStorage",
        message: "Do you want to add Zustand storage setup?",
        default: false,
      },
    ]);

    zustandStorageEnabled = enableZustandStorage;
  }

  // Navigation setup (interactive only, after Zustand storage)
  // 1) Ask whether to set up navigation at all
  // 2) If yes – choose between:
  //    - without-auth: only AppNavigator, no auth store/folder
  //    - with-auth: RootNavigator + AuthNavigator + auth store
  let navigationMode = "none";

  if (!options.yes) {
    const { enableNavigation } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableNavigation",
        message: "Do you want to set up base navigation?",
        default: true,
      },
    ]);

    if (enableNavigation) {
      const { navigationVariant } = await inquirer.prompt([
        {
          type: "list",
          name: "navigationVariant",
          message: "Choose navigation variant:",
          choices: [
            {
              name: "Without auth (only AppNavigator, no auth folder)",
              value: "app-only",
            },
            {
              name: "With auth (RootNavigator + AuthNavigator + auth store)",
              value: "with-auth",
            },
          ],
          default: "app-only",
        },
      ]);

      navigationMode = navigationVariant;
    } else {
      navigationMode = "none";
    }
  } else {
    // In non-interactive/--yes mode we don't break behaviour:
    // keep default "none" so template stays as-is.
    navigationMode = "none";
  }

  // Localization setup (interactive only, after Navigation)
  // Uses: i18next + react-i18next + i18next-icu + react-native-localize
  let localization = {
    enabled: false,
    defaultLanguage: null,
    withRemoteConfig: false,
  };

  if (!options.yes) {
    const { enableLocalization } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableLocalization",
        message:
          "Do you want to set up localization (i18next, react-i18next, i18next-icu, react-native-localize)?",
        default: false,
      },
    ]);

    if (enableLocalization) {
      const { defaultLanguage } = await inquirer.prompt([
        {
          type: "input",
          name: "defaultLanguage",
          message:
            "What default language do you want to use? (e.g. ru, en, ar)",
          default: "ru",
          validate: input => {
            const lang = String(input || "").trim();
            // allow: ru, en, ar, pt-BR, zh-Hans, etc.
            if (!/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/.test(lang)) {
              return "Please enter a valid language code (e.g. ru, en, ar, pt-BR)";
            }
            return true;
          },
          filter: input => String(input || "").trim(),
        },
      ]);

      // Check if Firebase Remote Config is enabled
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

      // Warn if remote-config is selected but Firebase Remote Config is not enabled
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

      localization = {
        enabled: true,
        defaultLanguage: defaultLanguage,
        withRemoteConfig,
      };

      // If localization is enabled but zustand storage is not, offer it again
      if (!zustandStorageEnabled) {
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
          zustandStorageEnabled = true;
        }
      }
    }
  }

  // Theme setup (interactive only, after Localization)
  let themeEnabled = false;

  if (!options.yes) {
    const { enableTheme } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableTheme",
        message: "Do you want to set up theme support (light/dark/system themes)?",
        default: false,
      },
    ]);

    themeEnabled = enableTheme;

    // If theme is enabled but zustand storage is not, offer it again
    if (themeEnabled && !zustandStorageEnabled) {
      const { enableZustandForTheme } = await inquirer.prompt([
        {
          type: "confirm",
          name: "enableZustandForTheme",
          message:
            "Theme support requires storage to persist theme selection. Do you want to enable Zustand storage? (If no, we'll use a simple context without persistence)",
          default: true,
        },
      ]);

      if (enableZustandForTheme) {
        zustandStorageEnabled = true;
      }
    }
  }

  // Check if directory already exists
  const projectPath = path.join(
    process.cwd(),
    projectNameArg || answers.projectName
  );
  if (await fs.pathExists(projectPath)) {
    // In non-interactive mode, skip overwrite prompt and just overwrite
    if (options.yes) {
      console.log(
        chalk.cyan(
          `Directory ${
            projectNameArg || answers.projectName
          } already exists. Overwriting...`
        )
      );
    } else {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: chalk.yellow(
            `Directory ${
              projectNameArg || answers.projectName
            } already exists. Overwrite?`
          ),
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.red("Aborted."));
        process.exit(0);
      }
    }
  }

  // Resolve splash screen directory path
  let splashScreenDir = null;
  const splashSource = options.splashScreenDir || answers.splashScreenDir;
  if (splashSource && splashSource.trim().length > 0) {
    splashScreenDir = path.isAbsolute(splashSource)
      ? splashSource
      : path.join(process.cwd(), splashSource);
    splashScreenDir = path.normalize(splashScreenDir);
  }

  // Resolve app icon directory path
  let appIconDir = null;
  const appIconSource = options.appIconDir || answers.appIconDir;
  if (appIconSource && appIconSource.trim().length > 0) {
    appIconDir = path.isAbsolute(appIconSource)
      ? appIconSource
      : path.join(process.cwd(), appIconSource);
    appIconDir = path.normalize(appIconDir);
  }

  // Resolve fonts directory path
  let fontsDir = null;
  const fontsSource = options.fontsDir || answers.fontsDir;
  if (fontsSource && fontsSource.trim().length > 0) {
    fontsDir = path.isAbsolute(fontsSource)
      ? fontsSource
      : path.join(process.cwd(), fontsSource);
    fontsDir = path.normalize(fontsDir);
  }

  return {
    projectName: projectNameArg || answers.projectName,
    bundleIdentifier: options.bundleId || answers.bundleIdentifier,
    displayName: options.displayName || answers.displayName,
    packageManager: options.packageManager || answers.packageManager || "pnpm",
    skipInstall:
      options.skipInstall ||
      (options.yes ? false : !answers.installDependencies),
    skipGit: options.skipGit || false,
    skipPods: options.skipPods || false,
    autoYes: options.yes || false,
    projectPath,
    splashScreenDir,
    appIconDir,
    fontsDir,
    envSetupSelectedEnvs,
    firebase: firebaseConfig,
    maps: mapsConfig,
    zustandStorage: zustandStorageEnabled,
    navigationMode,
    localization,
    theme: themeEnabled,
  };
}

module.exports = { getPrompts };

