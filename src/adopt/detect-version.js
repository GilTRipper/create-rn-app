const versionMap = require("./version-map.json");
const { compareVersions } = require("../shared/version");

// The map records template paths as they look in a generated project, except
// for the app directory, which carries the project name.
function resolvePath(mappedPath, appDirName) {
  return appDirName ? mappedPath.replace("{app}", appDirName) : mappedPath;
}

function fingerprintDependencies(dependencies, hashLength) {
  const crypto = require("crypto");
  const sorted = Object.keys(dependencies)
    .sort()
    .map(name => `${name}@${dependencies[name]}`)
    .join("\n");
  return crypto.createHash("sha1").update(sorted).digest("hex").slice(0, hashLength);
}

// Every signal is advisory. A project that has lived for a year will have had
// its dependencies bumped and its config files edited, so nothing here is
// treated as a hard filter - the version that explains the most evidence wins,
// and a tie is handed to the user rather than guessed at.
function scoreVersion(version, entry, project, hashLength) {
  let compared = 0;
  let matched = 0;

  for (const [mappedPath, hash] of Object.entries(entry.files)) {
    const filePath = resolvePath(mappedPath, project.appDirName);
    const projectHash = project.files[filePath];
    if (!projectHash) {
      continue;
    }
    compared += 1;
    if (projectHash.slice(0, hashLength) === hash) {
      matched += 1;
    }
  }

  return {
    version,
    reactNative: entry.reactNative,
    releasedAt: entry.releasedAt,
    matched,
    compared,
    dependenciesMatch:
      entry.dependencies ===
      fingerprintDependencies(project.dependencies || {}, hashLength),
    reactNativeMatch:
      Boolean(entry.reactNative) &&
      entry.reactNative === (project.dependencies || {})["react-native"],
  };
}

function rank(scores) {
  return [...scores].sort((a, b) => {
    if (a.matched !== b.matched) return b.matched - a.matched;
    if (a.dependenciesMatch !== b.dependenciesMatch) {
      return a.dependenciesMatch ? -1 : 1;
    }
    if (a.reactNativeMatch !== b.reactNativeMatch) {
      return a.reactNativeMatch ? -1 : 1;
    }
    // Same evidence either way: prefer the later release, which is the more
    // likely origin of a project still in use.
    return compareVersions(b.version, a.version);
  });
}

function sameEvidence(a, b) {
  return (
    a.matched === b.matched &&
    a.dependenciesMatch === b.dependenciesMatch &&
    a.reactNativeMatch === b.reactNativeMatch
  );
}

// `project` is { dependencies, files: { path: sha1 }, appDirName }.
function detectVersion(project, map = versionMap) {
  const hashLength = map.hashLength || 12;
  const scores = Object.entries(map.versions).map(([version, entry]) =>
    scoreVersion(version, entry, project, hashLength)
  );

  const ranked = rank(scores);
  const best = ranked[0] || null;
  const tied = best ? ranked.filter(score => sameEvidence(score, best)) : [];

  return {
    best,
    ranked,
    // More than one version explains the evidence equally well: the caller has
    // to ask rather than pick.
    ambiguous: tied.length > 1 ? tied : null,
    // The template pins react-native exactly, so a generated project carries the
    // exact version of some release. Matching neither that nor the dependency
    // set means the evidence points outside the map entirely - a project from a
    // release newer than this CLI, one whose RN was upgraded by hand, or one
    // create-rn-app never made. A file-count majority is not enough on its own:
    // most template files barely change between releases, so a stranger still
    // scores well. In every such case the caller has to ask.
    unreliable:
      !best ||
      best.compared === 0 ||
      best.matched === 0 ||
      (!best.reactNativeMatch && !best.dependenciesMatch),
  };
}

module.exports = { detectVersion, scoreVersion, fingerprintDependencies };
