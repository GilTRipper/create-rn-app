const { prompt } = require("./prompt");
const { apply } = require("./apply");

const meta = {
  id: "localization",
  title: "Localization",
  description: "i18n provider, language store and a default language",
  addable: true,
};

function isInstalled(config) {
  return Boolean(config?.localization?.enabled);
}

// Mirrors the prompt's defaults: "ru", no remote config, and storage on so the
// chosen language survives a restart. Remote config would pull in Firebase,
// which is never something to switch on unattended.
function enable(config) {
  return {
    ...config,
    localization: {
      enabled: true,
      defaultLanguage: "ru",
      withRemoteConfig: false,
    },
    zustandStorage: true,
  };
}

module.exports = { meta, isInstalled, prompt, apply, enable };
