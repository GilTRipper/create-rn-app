const { validateExistingDir, resolveOptionalDir } = require("../../shared/paths");

function prompt(ctx) {
  const { options } = ctx;
  ctx.questions = ctx.questions || [];

  if (!options.splashScreenDir && !options.yes) {
    ctx.questions.push({
      type: "input",
      name: "splashScreenDir",
      message:
        "Path to directory with splash screen images (optional, press Enter to skip):",
      default: "",
      validate: validateExistingDir,
    });
  }

  if (!options.appIconDir && !options.yes) {
    ctx.questions.push({
      type: "input",
      name: "appIconDir",
      message:
        "Path to directory with app icons from appicon.co (optional, press Enter to skip):",
      default: "",
      validate: validateExistingDir,
    });
  }

  if (!options.fontsDir && !options.yes) {
    ctx.questions.push({
      type: "input",
      name: "fontsDir",
      message: "Path to directory with fonts (optional, press Enter to skip):",
      default: "",
      validate: validateExistingDir,
    });
  }
}

function resolveAssetPaths(ctx, answers) {
  const { options, config } = ctx;

  config.splashScreenDir = resolveOptionalDir(
    options.splashScreenDir || answers.splashScreenDir
  );
  config.appIconDir = resolveOptionalDir(
    options.appIconDir || answers.appIconDir
  );
  config.fontsDir = resolveOptionalDir(options.fontsDir || answers.fontsDir);
}

module.exports = { prompt, resolveAssetPaths };
