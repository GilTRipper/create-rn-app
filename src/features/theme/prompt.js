const inquirer = require("inquirer");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.theme = false;

  if (options.yes) {
    return;
  }

  const { enableTheme } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableTheme",
      message: "Do you want to set up theme support (light/dark/system themes)?",
      default: false,
    },
  ]);

  config.theme = enableTheme;

  if (config.theme && !config.zustandStorage) {
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
      config.zustandStorage = true;
    }
  }
}

module.exports = { prompt };
