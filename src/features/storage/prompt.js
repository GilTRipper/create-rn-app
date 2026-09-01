const inquirer = require("inquirer");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.zustandStorage = false;

  if (options.yes) {
    return;
  }

  const { enableZustandStorage } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableZustandStorage",
      message: "Do you want to add Zustand storage setup?",
      default: false,
    },
  ]);

  config.zustandStorage = enableZustandStorage;
}

module.exports = { prompt };
