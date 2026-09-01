const inquirer = require("inquirer");
const path = require("path");
const fs = require("fs-extra");
const { ensureAbsolutePath } = require("../../shared/paths");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.firebase = {
    enabled: false,
    modules: [],
    googleFiles: {
      filesByEnv: {},
    },
  };

  if (options.yes) {
    return;
  }

  const { enableFirebase } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableFirebase",
      message: "Install Firebase?",
      default: false,
    },
  ]);

  if (!enableFirebase) {
    return;
  }

  config.firebase.enabled = true;

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

  config.firebase.modules = firebaseModules;

  const envSetupSelectedEnvs = config.envSetupSelectedEnvs || [];
  let envsForFirebase =
    envSetupSelectedEnvs && envSetupSelectedEnvs.length > 0
      ? [...envSetupSelectedEnvs]
      : ["production"];

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
      if (!envsForFirebase.some(env => env.toLowerCase() === "production")) {
        envsForFirebase = ["production", ...envsForFirebase];
      }
    }
  }

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
    config.firebase.googleFiles.filesByEnv[envsForFirebase[0]] = {
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
      config.firebase.googleFiles.filesByEnv[env] = {
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

module.exports = { prompt };
