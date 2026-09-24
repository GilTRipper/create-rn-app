const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  ACTIONS,
  classifyFile,
  classifyAll,
  groupByAction,
} = require("../../src/merge/classify");

const A = "aaaa";
const B = "bbbb";
const C = "cccc";

function action(input) {
  return classifyFile(input).action;
}

describe("merge/classify - the four core cases", () => {
  it("skips a file the template did not change, whatever the user did", () => {
    assert.equal(
      action({ baseline: A, current: A, theirs: A }),
      ACTIONS.SKIP_UNCHANGED
    );
    assert.equal(
      action({ baseline: A, current: B, theirs: A }),
      ACTIONS.SKIP_UNCHANGED
    );
  });

  it("overwrites a file the user never touched", () => {
    assert.equal(action({ baseline: A, current: A, theirs: B }), ACTIONS.OVERWRITE);
  });

  it("merges when both sides moved", () => {
    assert.equal(action({ baseline: A, current: B, theirs: C }), ACTIONS.MERGE);
  });

  it("never touches a file the template did not produce", () => {
    assert.equal(
      action({ baseline: undefined, current: B, theirs: undefined }),
      ACTIONS.SKIP_USER_OWNED
    );
  });
});

// Checking "did the template change it" before "did the user change it" is what
// keeps an upgrade quiet: most files move in neither direction, and a user's
// edits to them are nobody's business.
describe("merge/classify - ordering", () => {
  it("puts the template question first", () => {
    const heavilyEdited = { baseline: A, current: B, theirs: A };
    assert.equal(classifyFile(heavilyEdited).action, ACTIONS.SKIP_UNCHANGED);
    assert.match(classifyFile(heavilyEdited).reason, /template did not change/);
  });
});

describe("merge/classify - edges", () => {
  it("adds a file the template grew", () => {
    assert.equal(
      action({ baseline: undefined, current: undefined, theirs: C }),
      ACTIONS.ADD
    );
  });

  it("asks when the user deleted a file the template still ships", () => {
    assert.equal(
      action({ baseline: A, current: undefined, theirs: B }),
      ACTIONS.ASK_USER_DELETED
    );
  });

  it("reports, but never deletes, a file the template dropped", () => {
    assert.equal(
      action({ baseline: A, current: B, theirs: undefined }),
      ACTIONS.REPORT_REMOVED
    );
  });

  it("skips a file gone from both sides", () => {
    assert.equal(
      action({ baseline: A, current: undefined, theirs: undefined }),
      ACTIONS.SKIP_GONE
    );
  });

  // An adopted project has no baseline at all, so nothing can be merged
  // automatically - this is the case that makes adopt's first upgrade ask.
  it("asks when there is no baseline but both sides have the file", () => {
    assert.equal(
      action({ baseline: undefined, current: B, theirs: C }),
      ACTIONS.ASK_COLLISION
    );
  });

  it("stays quiet when a baseline-less file already matches the template", () => {
    assert.equal(
      action({ baseline: undefined, current: C, theirs: C }),
      ACTIONS.SKIP_UNCHANGED
    );
  });
});

describe("merge/classify - whole project", () => {
  it("classifies the union of manifest, disk and snapshot", () => {
    const classified = classifyAll({
      baseline: { "App.tsx": A, "old.ts": A, "ios/Podfile": A },
      current: { "App.tsx": B, "old.ts": A, "ios/Podfile": A, "src/mine.ts": C },
      theirs: { "App.tsx": C, "ios/Podfile": B, "src/new.ts": C },
    });

    const grouped = groupByAction(classified);
    assert.deepEqual(grouped[ACTIONS.MERGE], ["App.tsx"]);
    assert.deepEqual(grouped[ACTIONS.OVERWRITE], ["ios/Podfile"]);
    assert.deepEqual(grouped[ACTIONS.REPORT_REMOVED], ["old.ts"]);
    assert.deepEqual(grouped[ACTIONS.SKIP_USER_OWNED], ["src/mine.ts"]);
    assert.deepEqual(grouped[ACTIONS.ADD], ["src/new.ts"]);
  });

  it("returns paths in a stable order", () => {
    const classified = classifyAll({
      baseline: { z: A, a: A },
      current: { z: A, a: A },
      theirs: { m: B },
    });
    assert.deepEqual(Object.keys(classified), ["a", "m", "z"]);
  });
});
