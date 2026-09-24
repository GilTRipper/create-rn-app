const { prompt } = require("./prompt");
const { apply } = require("./apply");

const meta = {
  id: "storage",
  title: "Storage",
  description: "Zustand store persisted with MMKV",
  addable: true,
};

// Mirrors apply.js: the auth navigation variant pulls the store in on its own,
// even when the storage question was answered "no".
function isInstalled(config) {
  return (
    Boolean(config?.zustandStorage) || config?.navigationMode === "with-auth"
  );
}

// `add --yes` means "add this with defaults", the opposite of what --yes means
// during generation, where it turns every optional feature off. A feature that
// can be switched on without asking anything says so here.
function enable(config) {
  return { ...config, zustandStorage: true };
}

module.exports = { meta, isInstalled, prompt, apply, enable };
