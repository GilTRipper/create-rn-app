const fs = require("fs");

const tracked = new Set();
let hooksInstalled = false;

function removeAll() {
  for (const target of tracked) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // Best effort: the run is already ending, a leftover temp dir is not
      // worth masking the original failure.
    }
  }
  tracked.clear();
}

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  process.on("exit", removeAll);
  // SIGHUP is deliberately left alone: registering a handler for it overrides
  // the SIG_IGN that nohup installs, which would kill detached --max runs.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      removeAll();
      process.exit(130);
    });
  }
}

// Deep runs leave gigabytes of node_modules and Pods under os.tmpdir().
// after() hooks miss Ctrl+C and crashes, so every temp path is tracked here too.
function track(target) {
  installHooks();
  tracked.add(target);
  return target;
}

function untrack(target) {
  tracked.delete(target);
}

module.exports = { track, untrack, removeAll };
