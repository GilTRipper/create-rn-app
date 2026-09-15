const { prompt } = require("./prompt");
const { apply } = require("./apply");

const meta = {
  id: "navigation",
  title: "Navigation",
  description: "React Navigation setup, with or without an auth flow",
  addable: true,
};

function isInstalled(config) {
  const mode = config?.navigationMode;
  return Boolean(mode) && mode !== "none";
}

module.exports = { meta, isInstalled, prompt, apply };
