const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { isNodeVersionSupported } = require("../../src/utils");
const { track } = require("./cleanup-registry");

const MINUTE = 60 * 1000;

function hasFlag(flag, envVar) {
  return process.argv.includes(flag) || process.env[envVar] === "1";
}

// --deep installs the generated app and runs its own toolchain against it.
// --pod-install and --gradle add the native halves; both need node_modules,
// so they imply --deep. --max turns everything on.
function maxEnabled() {
  return hasFlag("--max", "CREATE_RN_TEST_MAX");
}

function deepEnabled() {
  return maxEnabled() || hasFlag("--deep", "CREATE_RN_TEST_DEEP") || podInstallEnabled() || gradleEnabled();
}

function podInstallEnabled() {
  return maxEnabled() || hasFlag("--pod-install", "CREATE_RN_TEST_POD_INSTALL");
}

function gradleEnabled() {
  return maxEnabled() || hasFlag("--gradle", "CREATE_RN_TEST_GRADLE");
}

function deepPackageManager() {
  const explicit = process.argv.indexOf("--package-manager");
  if (explicit !== -1 && process.argv[explicit + 1]) {
    return process.argv[explicit + 1];
  }
  if (process.env.CREATE_RN_TEST_PM) {
    return process.env.CREATE_RN_TEST_PM;
  }
  // The template ships pnpm-lock.yaml and pnpm.patchedDependencies; npm would
  // silently skip those patches, so deep runs prefer pnpm when it is installed.
  return which("pnpm") ? "pnpm" : "npm";
}

function which(binary) {
  const result = spawnSync("which", [binary], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function preflight() {
  const problems = [];
  if (!isNodeVersionSupported(process.versions.node)) {
    problems.push(
      `Node ${process.versions.node} cannot run deep checks; the generated app requires >= 22.11.0 (nvm use 22).`
    );
  }
  const pm = deepPackageManager();
  if (!which(pm)) {
    problems.push(`Package manager "${pm}" is not on PATH.`);
  }
  if (podInstallEnabled()) {
    if (process.platform !== "darwin") {
      problems.push("--pod-install needs macOS.");
    } else if (!which("pod")) {
      problems.push("--pod-install needs CocoaPods on PATH.");
    }
  }
  if (gradleEnabled() && !which("java")) {
    problems.push("--gradle needs a JDK on PATH.");
  }
  return problems;
}

function tail(output, lines = 40) {
  return String(output || "").trimEnd().split("\n").slice(-lines).join("\n");
}

const ERROR_LINE = /(FAILURE|FAILED|What went wrong|Execution failed|Caused by|error TS\d|SyntaxError|\berror\b:|\berror\b\s)/i;

// Gradle buries the cause in the middle of hundreds of task lines, Metro puts
// it before a long stack, tsc puts it first. Head and foot alone miss all three,
// so the lines that name the failure are pulled out explicitly.
function keyLines(output, limit = 25) {
  const seen = new Set();
  for (const line of String(output || "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && ERROR_LINE.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      if (seen.size >= limit) {
        break;
      }
    }
  }
  return [...seen];
}

function excerpt(output, head = 20, foot = 15) {
  const lines = String(output || "").trimEnd().split("\n");
  const body =
    lines.length <= head + foot
      ? lines
      : [
          ...lines.slice(0, head),
          `  ... ${lines.length - head - foot} lines omitted ...`,
          ...lines.slice(-foot),
        ];

  const key = keyLines(output);
  if (key.length === 0) {
    return body.join("\n");
  }
  return [...body, "", "--- lines naming the failure ---", ...key].join("\n");
}

function run(label, command, args, { cwd, timeout, env }) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    timeout,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", ...env },
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const seconds = Math.round((Date.now() - started) / 1000);

  if (result.error) {
    const reason = result.error.code === "ETIMEDOUT" ? `timed out after ${timeout / MINUTE} min` : result.error.message;
    return { ok: false, seconds, output, message: `${label} failed (${reason})\n${excerpt(output)}` };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      seconds,
      output,
      message: `${label} exited with ${result.status} after ${seconds}s\n${excerpt(output)}`,
    };
  }
  return { ok: true, seconds, output, message: `${label} passed in ${seconds}s` };
}

function localBin(projectPath, binary) {
  return path.join(projectPath, "node_modules", ".bin", binary);
}

function installDependencies(projectPath) {
  const pm = deepPackageManager();
  const args =
    pm === "npm"
      ? ["install", "--legacy-peer-deps"]
      : pm === "pnpm"
        ? ["install", "--no-frozen-lockfile"]
        : ["install"];
  return run(`${pm} install`, pm, args, { cwd: projectPath, timeout: 20 * MINUTE });
}

function typecheck(projectPath) {
  return run("tsc --noEmit", localBin(projectPath, "tsc"), ["--noEmit"], {
    cwd: projectPath,
    timeout: 10 * MINUTE,
  });
}

function lint(projectPath) {
  return run("eslint .", localBin(projectPath, "eslint"), ["."], {
    cwd: projectPath,
    timeout: 10 * MINUTE,
  });
}

function bundle(projectPath, platform) {
  const outDir = track(fs.mkdtempSync(path.join(os.tmpdir(), `e2e-bundle-${platform}-`)));
  return run(
    `metro bundle (${platform})`,
    localBin(projectPath, "react-native"),
    [
      "bundle",
      "--entry-file", "index.js",
      "--platform", platform,
      "--dev", "false",
      "--bundle-output", path.join(outDir, `${platform}.jsbundle`),
      "--assets-dest", outDir,
    ],
    { cwd: projectPath, timeout: 15 * MINUTE }
  );
}

// A local spec repo older than the pods the generated app asks for is a
// machine state problem, not a generator bug, so it is retried rather than
// reported as a failure of the project.
const STALE_SPEC_REPO = /out-of-date source repos|could not find compatible versions/i;

function podInstall(projectPath) {
  const options = {
    cwd: path.join(projectPath, "ios"),
    timeout: 30 * MINUTE,
    env: { LANG: "en_US.UTF-8" },
  };

  const first = run("pod install", "pod", ["install"], options);
  if (first.ok || !STALE_SPEC_REPO.test(first.output)) {
    return first;
  }

  const retry = run("pod install --repo-update", "pod", ["install", "--repo-update"], {
    ...options,
    timeout: 45 * MINUTE,
  });
  return retry.ok
    ? { ...retry, message: `${retry.message} (needed a CocoaPods spec repo refresh)` }
    : retry;
}

function gradleAssemble(projectPath) {
  return run("gradlew assembleDebug", "./gradlew", ["assembleDebug", "--no-daemon"], {
    cwd: path.join(projectPath, "android"),
    timeout: 45 * MINUTE,
  });
}

module.exports = {
  deepEnabled,
  podInstallEnabled,
  gradleEnabled,
  maxEnabled,
  deepPackageManager,
  preflight,
  installDependencies,
  typecheck,
  lint,
  bundle,
  podInstall,
  gradleAssemble,
  tail,
  excerpt,
  keyLines,
  which,
};
