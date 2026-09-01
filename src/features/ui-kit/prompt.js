const inquirer = require("inquirer");
const chalk = require("chalk");
const {
  UI_KIT_ALL,
  getUiKitPromptChoices,
  resolveUiKitComponents,
} = require("./catalog");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.uiKit = {
    enabled: false,
    components: [],
  };

  if (options.yes) {
    return;
  }

  const { enableUiKit } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableUiKit",
      message: "Copy UI components into src/ui/components?",
      default: false,
    },
  ]);

  if (!enableUiKit) {
    return;
  }

  while (true) {
    const { uiKitSelection } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "uiKitSelection",
        message: "Which UI components? Select All, or pick specific ones.",
        choices: getUiKitPromptChoices(),
      },
    ]);

    if (!uiKitSelection || uiKitSelection.length < 1) {
      console.log(chalk.red("Please select All or at least one component."));
      continue;
    }

    const selected = resolveUiKitComponents(uiKitSelection);
    if (selected.length === 0) {
      console.log(chalk.red("Please select All or at least one component."));
      continue;
    }

    config.uiKit = {
      enabled: true,
      components: uiKitSelection.includes(UI_KIT_ALL)
        ? [UI_KIT_ALL]
        : selected.map(component => component.id),
    };
    break;
  }
}

module.exports = { prompt };
