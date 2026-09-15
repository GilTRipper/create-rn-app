// Minimal semver comparison: the CLI ships its own version and reads another
// out of a manifest, and both are plain major.minor.patch. Prerelease and build
// metadata are ignored on purpose - adding a semver dependency for this would
// not earn its place.
function parseVersion(version) {
  const [core] = String(version || "").split(/[-+]/);
  const parts = core.split(".").map(part => parseInt(part, 10));
  return [0, 1, 2].map(index =>
    Number.isFinite(parts[index]) ? parts[index] : 0
  );
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] > b[index] ? 1 : -1;
    }
  }
  return 0;
}

module.exports = { parseVersion, compareVersions };
