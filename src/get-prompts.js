const inquirer = require("inquirer");
const projectPrompt = require("./core/project-prompt");
const assets = require("./features/assets");
const environments = require("./features/environments");
const firebase = require("./features/firebase");
const maps = require("./features/maps");
const storage = require("./features/storage");
const navigation = require("./features/navigation");
const localization = require("./features/localization");
const theme = require("./features/theme");
const uiKit = require("./features/ui-kit");

async function getPrompts(projectNameArg, options) {
  const ctx = {
    projectNameArg,
    options,
    questions: [],
    config: {},
  };

  projectPrompt.collectQuestions(ctx);
  assets.prompt(ctx);

  const answers = await inquirer.prompt(ctx.questions);
  projectPrompt.applyAnswers(ctx, answers);
  assets.resolveAssetPaths(ctx, answers);

  await environments.prompt(ctx);
  await firebase.prompt(ctx);
  await maps.prompt(ctx);
  await storage.prompt(ctx);
  await navigation.prompt(ctx);
  await localization.prompt(ctx);
  await theme.prompt(ctx);
  await uiKit.prompt(ctx);
  await projectPrompt.confirmOverwrite(ctx);

  return ctx.config;
}

module.exports = { getPrompts };
