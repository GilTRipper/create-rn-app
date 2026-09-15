const assets = require("./assets");
const auth = require("./auth");
const environments = require("./environments");
const firebase = require("./firebase");
const localization = require("./localization");
const maps = require("./maps");
const navigation = require("./navigation");
const storage = require("./storage");
const theme = require("./theme");
const uiKit = require("./ui-kit");

// A catalog, deliberately not an orchestrator. Prompt order lives in
// get-prompts.js and apply order in core/create-app.js, both spelled out by
// hand - the apply sequence is order-sensitive and must never become a forEach
// over this list. Sorted by id so listings stay stable.
const FEATURES = [
  assets,
  auth,
  environments,
  firebase,
  localization,
  maps,
  navigation,
  storage,
  theme,
  uiKit,
];

function listFeatures({ includeHidden = false } = {}) {
  return FEATURES.filter(feature => includeHidden || !feature.meta.hidden);
}

function getFeature(id) {
  return FEATURES.find(feature => feature.meta.id === id) || null;
}

// config is the sanitized snapshot from the manifest. Without one we can still
// describe the catalog, we just cannot say what is installed - hence null
// rather than false, which would wrongly read as "not installed".
function describeFeature(feature, config) {
  const { meta } = feature;
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    addable: Boolean(meta.addable),
    unavailableReason: meta.unavailableReason || null,
    installed: config ? feature.isInstalled(config) : null,
  };
}

function describeFeatures(config = null, { includeHidden = false } = {}) {
  return listFeatures({ includeHidden }).map(feature =>
    describeFeature(feature, config)
  );
}

// The three buckets a listing shows. A feature that is already installed is
// reported as such even when it is not addable.
function groupFeatures(config = null, options = {}) {
  const described = describeFeatures(config, options);
  return {
    installed: described.filter(feature => feature.installed === true),
    addable: described.filter(
      feature => feature.installed !== true && feature.addable
    ),
    unavailable: described.filter(
      feature => feature.installed !== true && !feature.addable
    ),
  };
}

module.exports = {
  FEATURES,
  listFeatures,
  getFeature,
  describeFeature,
  describeFeatures,
  groupFeatures,
};
