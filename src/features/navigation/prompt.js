const inquirer = require("inquirer");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.navigationMode = "none";

  if (options.yes) {
    config.navigationMode = "none";
    return;
  }

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

    config.navigationMode = navigationVariant;
  } else {
    config.navigationMode = "none";
  }
}

module.exports = { prompt };
