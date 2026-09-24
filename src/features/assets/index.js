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

// Assets have no snapshot lane at all. Their source directories are local
// paths, deliberately kept out of the manifest, so no snapshot can reproduce
// them - and the work is copying binaries and rewriting files that carry this
// project's own generated ids (link-assets-manifest.json, Info.plist, the
// Xcode project). `add` runs this straight against the project instead.
async function applyDirect(ctx) {
  await copyProjectFonts(ctx);
  await copySplashAndIcons(ctx);
}

module.exports = {
  applyDirect,
  meta,
  isInstalled,
  prompt,
  resolveAssetPaths,
  copyProjectFonts,
  copySplashAndIcons,
};
