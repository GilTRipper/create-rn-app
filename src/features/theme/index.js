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

// Mirrors the prompt's own defaults: theme on, and storage with it, because
// without somewhere to persist the choice the provider falls back to a plain
// context that forgets it.
function enable(config) {
  return { ...config, theme: true, zustandStorage: true };
}

module.exports = { meta, isInstalled, prompt, apply, enable };
