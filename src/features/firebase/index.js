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

function enable(config) {
  return {
    ...config,
    firebase: { enabled: true, modules: ["analytics"], googleFilesEnvs: [] },
  };
}

// Registering GoogleService-Info.plist against the Xcode targets rewrites
// project.pbxproj with this project's own object ids, so it can never be
// carried over from a snapshot. `add` runs this against the real project once
// the file lane is written.
async function applyNative(ctx) {
  await addToXcode(ctx);
}

const postAddNote =
  "Drop your google-services.json and GoogleService-Info.plist into the project - " +
  "Firebase will not start without them.";

module.exports = {
  meta,
  isInstalled,
  prompt,
  apply,
  addToXcode,
  enable,
  applyNative,
  postAddNote,
};
