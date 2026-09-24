const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PACKAGE_NAME = "@giltripper/create-rn-app";

// A snapshot of how the project looked when it was generated has to be built by
// the code that generated it. Running the current CLI with an old config would
// fold every template change between the two versions into the diff, and the
// merge would then quietly apply them as if they were the user's own.
//
// The download is cached: it costs about twenty seconds once per version, and
// nothing after that.
function cacheRoot() {
  return path.join(os.tmpdir(), "crna-versions");
}

function versionDir(version) {
  return path.join(cacheRoot(), version, "package");
}

function isReady(version) {
  const dir = versionDir(version);
  return (
    fs.existsSync(path.join(dir, "src", "template.js")) &&
    fs.existsSync(path.join(dir, "node_modules"))
  );
}

function tarballUrl(version) {
  const output = execFileSync(
    "npm",
    ["view", `${PACKAGE_NAME}@${version}`, "dist.tarball", "--json"],
    { encoding: "utf8" }
  );
  return JSON.parse(output);
}

async function download(version) {
  const target = path.join(cacheRoot(), version);
  await fs.remove(target);
  await fs.ensureDir(target);

  const url = tarballUrl(version);
  execFileSync("sh", ["-c", `curl -sL "${url}" | tar -xz -C "${target}"`], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  execFileSync(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--silent"],
    { cwd: versionDir(version), stdio: ["ignore", "ignore", "pipe"] }
  );
}

async function ensureVersion(version, { onDownload } = {}) {
  if (isReady(version)) {
    return versionDir(version);
  }

  if (onDownload) {
    onDownload(version);
  }
  await download(version);

  if (!isReady(version)) {
    throw new Error(`Could not prepare create-rn-app ${version} for comparison`);
  }
  return versionDir(version);
}

async function loadCreateApp(version, options) {
  const dir = await ensureVersion(version, options);
  // eslint-disable-next-line import/no-dynamic-require
  const { createApp } = require(path.join(dir, "src", "template.js"));
  if (typeof createApp !== "function") {
    throw new Error(`create-rn-app ${version} exposes no createApp`);
  }
  return createApp;
}

module.exports = { ensureVersion, loadCreateApp, versionDir, isReady };
