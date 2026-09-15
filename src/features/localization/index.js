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

module.exports = { meta, isInstalled, prompt, apply };
