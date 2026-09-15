const { apply } = require("./apply");

const meta = {
  id: "auth",
  title: "Auth",
  description: "Auth store and AuthNavigator wired into the navigation tree",
  addable: false,
  // Apply-only by contract: the question lives in `navigation`, so auth is
  // never chosen on its own.
  unavailableReason: 'comes with navigation - pick the "with auth" variant',
  hidden: true,
};

function isInstalled(config) {
  return config?.navigationMode === "with-auth";
}

module.exports = { meta, isInstalled, apply };
