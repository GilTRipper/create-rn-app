const { prompt } = require("./prompt");
const { apply, addToXcode } = require("./apply");

const meta = {
  id: "firebase",
  title: "Firebase",
  description: "Analytics, Crashlytics, Remote Config and push notifications",
  addable: true,
};

function isInstalled(config) {
  return Boolean(config?.firebase?.enabled);
}

module.exports = { meta, isInstalled, prompt, apply, addToXcode };
