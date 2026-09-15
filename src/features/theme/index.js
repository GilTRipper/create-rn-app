const { prompt } = require("./prompt");
const { apply } = require("./apply");

const meta = {
  id: "theme",
  title: "Theme",
  description: "Light / dark / system theme provider",
  addable: true,
};

function isInstalled(config) {
  return Boolean(config?.theme);
}

module.exports = { meta, isInstalled, prompt, apply };
