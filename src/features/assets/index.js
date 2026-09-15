const { prompt, resolveAssetPaths } = require("./prompt");
const { copyProjectFonts, copySplashAndIcons } = require("./apply");

const meta = {
  id: "assets",
  title: "Assets",
  description: "Custom fonts, splash screen and app icons",
  addable: true,
};

function isInstalled(config) {
  const assets = config?.assets;
  return Boolean(assets?.fonts || assets?.splashScreen || assets?.appIcon);
}

module.exports = {
  meta,
  isInstalled,
  prompt,
  resolveAssetPaths,
  copyProjectFonts,
  copySplashAndIcons,
};
