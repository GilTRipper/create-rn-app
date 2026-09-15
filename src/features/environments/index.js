const { prompt } = require("./prompt");
const { apply, renameDefaultScheme } = require("./apply");

const meta = {
  id: "environments",
  title: "Environments",
  description:
    "Separate dev/stage/prod builds with their own bundle ids and schemes",
  addable: false,
  unavailableReason:
    "creates per-environment targets inside the Xcode project, too invasive for an app that already has one",
};

function isInstalled(config) {
  return (config?.envSetupSelectedEnvs || []).length > 0;
}

module.exports = { meta, isInstalled, prompt, apply, renameDefaultScheme };
