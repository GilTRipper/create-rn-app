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

module.exports = { meta, isInstalled, prompt, apply };
