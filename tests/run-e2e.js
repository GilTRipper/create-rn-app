#!/usr/bin/env node

const { run } = require("node:test");
const { spec } = require("node:test/reporters");
const fs = require("fs");
const path = require("path");
const { finished } = require("node:stream/promises");

const args = process.argv.slice(2);
const filters = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--package-manager") {
    if (args[i + 1]) {
      process.env.CREATE_RN_TEST_PM = args[i + 1];
      i += 1;
    }
    continue;
  }
  if (arg === "--test-pods") {
    process.env.CREATE_RN_TEST_PODS = "1";
    continue;
  }
  if (arg === "--scenario") {
    if (args[i + 1]) {
      process.env.CREATE_RN_TEST_SCENARIO = args[i + 1];
      i += 1;
    }
    continue;
  }
  // Deep layers run the generated app's own toolchain, so they are opt-in:
  // the default run stays fast and works on the Linux CI box.
  if (arg === "--deep") {
    process.env.CREATE_RN_TEST_DEEP = "1";
    continue;
  }
  if (arg === "--pod-install") {
    process.env.CREATE_RN_TEST_POD_INSTALL = "1";
    continue;
  }
  if (arg === "--gradle") {
    process.env.CREATE_RN_TEST_GRADLE = "1";
    continue;
  }
  if (arg === "--max") {
    process.env.CREATE_RN_TEST_MAX = "1";
    continue;
  }
  if (arg.startsWith("-")) {
    continue;
  }
  filters.push(arg);
}

const e2eDir = path.join(__dirname, "e2e");
const files = fs
  .readdirSync(e2eDir)
  .filter(file => file.endsWith(".test.js"))
  .map(file => path.join(e2eDir, file))
  .filter(file => {
    if (filters.length === 0) {
      return true;
    }
    const base = path.basename(file, ".test.js");
    return filters.some(filter => {
      const needle = path.basename(filter, ".test.js").replace(/\\/g, "/");
      return base === needle || file.endsWith(`${path.sep}${needle}.test.js`);
    });
  });

if (filters.length > 0 && files.length === 0) {
  console.error(
    `No e2e files matched: ${filters.join(", ")}. Try a basename like maps or app-tsx.`
  );
  process.exit(1);
}

function runnerTimeout() {
  if (process.env.CREATE_RN_TEST_MAX === "1" || process.env.CREATE_RN_TEST_GRADLE === "1") {
    return 60 * 60 * 1000;
  }
  if (process.env.CREATE_RN_TEST_POD_INSTALL === "1") {
    return 45 * 60 * 1000;
  }
  if (process.env.CREATE_RN_TEST_DEEP === "1") {
    return 30 * 60 * 1000;
  }
  return 180000;
}

async function main() {
  let failed = false;
  const stream = run({
    files,
    timeout: runnerTimeout(),
    concurrency: 1,
  });

  stream.on("test:fail", () => {
    failed = true;
  });

  stream.compose(spec).pipe(process.stdout);
  await finished(stream);
  process.exit(failed ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
