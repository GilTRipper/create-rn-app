const inquirer = require("inquirer");
const chalk = require("chalk");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.envSetupSelectedEnvs = [];

  if (options.yes) {
    return;
  }

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
      config.envSetupSelectedEnvs = [];
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

    config.envSetupSelectedEnvs = envSelection;
    break;
  }
}

module.exports = { prompt };
