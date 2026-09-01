const fs = require("fs");
const path = require("path");

function join(projectPath, ...parts) {
  return path.join(projectPath, ...parts);
}

function exists(projectPath, ...parts) {
  return fs.existsSync(join(projectPath, ...parts));
}

function readText(projectPath, ...parts) {
  return fs.readFileSync(join(projectPath, ...parts), "utf8");
}

function readJson(projectPath, ...parts) {
  return JSON.parse(readText(projectPath, ...parts));
}

function readBytes(projectPath, ...parts) {
  return fs.readFileSync(join(projectPath, ...parts));
}

function findIosAppDir(projectPath) {
  const iosDir = join(projectPath, "ios");
  const entry = fs.readdirSync(iosDir).find(name => {
    const full = path.join(iosDir, name);
    return (
      fs.statSync(full).isDirectory() &&
      fs.existsSync(path.join(full, "AppDelegate.swift"))
    );
  });
  if (!entry) {
    throw new Error("AppDelegate.swift not found");
  }
  return entry;
}

function readAppDelegate(projectPath) {
  const appDir = findIosAppDir(projectPath);
  return readText(projectPath, "ios", appDir, "AppDelegate.swift");
}

module.exports = {
  join,
  exists,
  readText,
  readJson,
  readBytes,
  findIosAppDir,
  readAppDelegate,
};
