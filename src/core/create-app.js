const ora = require("ora");
const { copyTemplate } = require("./copy-template");
const { replacePlaceholders } = require("./replace-placeholders");
const { renameNative } = require("./rename-native");
const { updateAppTsx } = require("./update-app-tsx");
const { install, setupXcodeEnvLocal } = require("./install");
const assets = require("../features/assets");
const environments = require("../features/environments");
const firebase = require("../features/firebase");
const storage = require("../features/storage");
const auth = require("../features/auth");
const navigation = require("../features/navigation");
const localization = require("../features/localization");
const theme = require("../features/theme");
const uiKit = require("../features/ui-kit");
const maps = require("../features/maps");

async function createApp(config) {
  const ctx = { config };

  await copyTemplate(config);

  const replaceSpinner = ora("Replacing placeholders...").start();
  try {
    await replacePlaceholders(config);
    await renameNative(config);
    await assets.copyProjectFonts(ctx);
    await environments.apply(ctx);
    await firebase.apply(ctx);
    await storage.apply(ctx);
    await auth.apply(ctx);
    await navigation.apply(ctx);
    await localization.apply(ctx);
    await theme.apply(ctx);
    await uiKit.apply(ctx);
    await updateAppTsx(ctx);
    await firebase.addToXcode(ctx);
    await maps.apply(ctx);
    await environments.renameDefaultScheme(ctx);
    replaceSpinner.succeed("Placeholders replaced");
  } catch (error) {
    replaceSpinner.fail("Failed to replace placeholders");
    throw error;
  }

  await setupXcodeEnvLocal(config.projectPath);
  await assets.copySplashAndIcons(ctx);
  await install(ctx);
}

module.exports = { createApp };
