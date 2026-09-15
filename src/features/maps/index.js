const { prompt } = require("./prompt");
const { apply } = require("./apply");

const meta = {
  id: "maps",
  title: "Maps",
  description:
    "react-native-maps or Mapbox, with the native Google Maps setup when needed",
  addable: true,
};

function isInstalled(config) {
  return Boolean(config?.maps?.enabled);
}

module.exports = { meta, isInstalled, prompt, apply };
