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

// react-native-maps is the only provider that needs no account and no token -
// Apple Maps on iOS, and Google only if a key is added later. Mapbox and the
// Google Maps setup both want credentials, so they stay an explicit choice.
function enable(config) {
  return { ...config, maps: { enabled: true, provider: "react-native-maps" } };
}

module.exports = { meta, isInstalled, prompt, apply, enable };
