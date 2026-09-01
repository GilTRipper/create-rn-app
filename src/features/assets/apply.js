const { copyFonts } = require("./fonts");
const { copySplashScreenImages } = require("./splash");
const { copyAppIcons } = require("./icons");

async function copyProjectFonts(ctx) {
  const { fontsDir, projectPath, projectName } = ctx.config;
  await copyFonts(fontsDir, projectPath, projectName);
}

async function copySplashAndIcons(ctx) {
  const { splashScreenDir, appIconDir, projectPath, projectName } = ctx.config;
  await copySplashScreenImages(splashScreenDir, projectPath, projectName);
  await copyAppIcons(appIconDir, projectPath, projectName);
}

module.exports = { copyProjectFonts, copySplashAndIcons };
