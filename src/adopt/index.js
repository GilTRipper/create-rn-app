const { detectConfig } = require("./detect-config");
const { detectVersion } = require("./detect-version");
const { inspectProject } = require("./collect");

module.exports = { detectConfig, detectVersion, inspectProject };
