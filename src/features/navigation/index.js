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

// Mirrors the prompt's own default variant. The auth flow brings a store and
// two more navigators with it, so it stays an explicit choice.
function enable(config) {
  return { ...config, navigationMode: "app-only" };
}

module.exports = { meta, isInstalled, prompt, apply, enable };
