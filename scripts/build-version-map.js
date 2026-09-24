#!/usr/bin/env node
//
// Builds src/adopt/version-map.json: the data `adopt` uses to work out which
// CLI version generated an existing project.
//
// Run it at release time, after publishing, so the new version is in the map:
//   node scripts/build-version-map.js
//
// Only two kinds of template file are useful here. A file has to be free of
// placeholders, so its hash is the same in every generated project, and it has
// to actually differ between at least two published versions - a file that is
// identical everywhere carries no information and only bloats the map.

const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { shouldHashFile } = require("../src/manifest/hash");

const PACKAGE_NAME = "@giltripper/create-rn-app";
const OUTPUT = path.join(__dirname, "../src/adopt/version-map.json");
const HASH_LENGTH = 12;

// replace-placeholders.js substitutes these, so any file containing one hashes
// differently in every project and is useless for identification.
const PLACEHOLDERS = ["HelloWorld", "helloworld", "com.helloworld", "Hello World"];

function npmView(spec, field) {
  return execFileSync("npm", ["view", spec, field, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function publishedVersions() {
  return JSON.parse(npmView(PACKAGE_NAME, "versions"));
}

function releaseDates() {
  return JSON.parse(npmView(PACKAGE_NAME, "time"));
}

// Extracted templates are cached between runs: at release time only the newest
// version is missing, and re-downloading 60 MB to add one row is wasteful.
function downloadTemplate(version, targetDir) {
  const templateDir = path.join(targetDir, "package/template");
  if (fs.existsSync(path.join(templateDir, "package.json"))) {
    return templateDir;
  }

  const tarball = JSON.parse(npmView(`${PACKAGE_NAME}@${version}`, "dist.tarball"));
  fs.ensureDirSync(targetDir);
  execFileSync(
    "sh",
    ["-c", `curl -sL "${tarball}" | tar -xz -C "${targetDir}" package/template`],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  return templateDir;
}

// package.json is the single most informative file, but its `name` field holds
// a placeholder, so the content filter throws it away. The dependency set has
// no placeholders in it at all, so it is fingerprinted separately - this is
// what tells apart releases that only bumped a library.
function dependenciesFingerprint(dependencies) {
  const sorted = Object.keys(dependencies)
    .sort()
    .map(name => `${name}@${dependencies[name]}`)
    .join("\n");
  return crypto.createHash("sha1").update(sorted).digest("hex").slice(0, HASH_LENGTH);
}

function collectFiles(root, base = "", collected = []) {
  for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectFiles(root, relative, collected);
    } else if (entry.isFile()) {
      collected.push(relative);
    }
  }
  return collected;
}

function hashPlaceholderFreeFiles(templateDir) {
  const hashes = {};

  for (const relative of collectFiles(templateDir)) {
    // The same exclusions the manifest uses, so the two never drift apart.
    if (!shouldHashFile(relative)) {
      continue;
    }

    const content = fs.readFileSync(path.join(templateDir, relative));
    const text = content.toString("utf8");
    if (PLACEHOLDERS.some(placeholder => text.includes(placeholder))) {
      continue;
    }

    hashes[relative] = crypto
      .createHash("sha1")
      .update(content)
      .digest("hex")
      .slice(0, HASH_LENGTH);
  }

  return hashes;
}

// A path only earns a place in the map if the published versions disagree about
// it. `_gitignore` is renamed to `.gitignore` on copy, so it is recorded under
// the name it has in a generated project.
function keepDiscriminatingPaths(byVersion) {
  const versions = Object.keys(byVersion);
  const allPaths = new Set(versions.flatMap(v => Object.keys(byVersion[v].files)));
  const discriminating = [];

  for (const filePath of allPaths) {
    const seen = new Set(versions.map(v => byVersion[v].files[filePath] || null));
    if (seen.size > 1) {
      discriminating.push(filePath);
    }
  }

  discriminating.sort();
  for (const version of versions) {
    const kept = {};
    for (const filePath of discriminating) {
      const hash = byVersion[version].files[filePath];
      if (hash) {
        kept[generatedPath(filePath)] = hash;
      }
    }
    byVersion[version].files = kept;
  }

  return discriminating.length;
}

// Paths as they look in a generated project: `_gitignore` is renamed on copy,
// and `ios/HelloWorld/` becomes `ios/<ProjectName>/`. adopt substitutes {app}
// once it has read the project name.
function generatedPath(templatePath) {
  if (templatePath === "_gitignore") {
    return ".gitignore";
  }
  return templatePath.replace(/(^|\/)HelloWorld(\/)/, "$1{app}$2");
}

function main() {
  const versions = publishedVersions();
  const times = releaseDates();
  const workDir = path.join(os.tmpdir(), "crna-version-map-cache");
  const byVersion = {};

  {
    for (const version of versions) {
      process.stdout.write(`  ${version} … `);
      const templateDir = downloadTemplate(version, path.join(workDir, version));
      const templatePackageJson = fs.readJsonSync(
        path.join(templateDir, "package.json")
      );
      const dependencies = {
        ...templatePackageJson.dependencies,
        ...templatePackageJson.devDependencies,
      };

      byVersion[version] = {
        reactNative: dependencies["react-native"] || null,
        react: dependencies.react || null,
        releasedAt: times[version] ? times[version].slice(0, 10) : null,
        dependencies: dependenciesFingerprint(dependencies),
        files: hashPlaceholderFreeFiles(templateDir),
      };
      console.log(`${Object.keys(byVersion[version].files).length} files`);
    }

    const kept = keepDiscriminatingPaths(byVersion);
    fs.writeJsonSync(
      OUTPUT,
      { package: PACKAGE_NAME, hashLength: HASH_LENGTH, versions: byVersion },
      { spaces: 2 }
    );

    console.log(`\n${versions.length} versions, ${kept} discriminating files`);
    console.log(`→ ${path.relative(process.cwd(), OUTPUT)} (${
      (fs.statSync(OUTPUT).size / 1024).toFixed(1)
    } KB)`);
  }
}

main();
