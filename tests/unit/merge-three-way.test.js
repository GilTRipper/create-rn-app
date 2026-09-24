const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mergeThreeWay, isGitAvailable } = require("../../src/merge/three-way");

const describeMerge = isGitAvailable() ? describe : describe.skip;

function lines(count, replace = {}) {
  return (
    Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      return replace[number] || `line${number}`;
    }).join("\n") + "\n"
  );
}

describeMerge("merge/three-way", () => {
  it("takes the template version when the user never touched the file", () => {
    const base = lines(20);
    const theirs = lines(20, { 5: "TEMPLATE" });
    const result = mergeThreeWay({ base, ours: base, theirs });

    assert.equal(result.merged, theirs);
    assert.equal(result.clean, true);
    assert.equal(result.conflicts, 0);
  });

  it("keeps the user version when the template did not move", () => {
    const base = lines(20);
    const ours = lines(20, { 5: "MINE" });
    const result = mergeThreeWay({ base, ours, theirs: base });

    assert.equal(result.merged, ours);
    assert.equal(result.clean, true);
    assert.equal(result.unchanged, true);
  });

  it("combines edits that do not overlap", () => {
    const result = mergeThreeWay({
      base: lines(20),
      ours: lines(20, { 3: "MINE" }),
      theirs: lines(20, { 17: "TEMPLATE" }),
    });

    assert.equal(result.clean, true);
    assert.match(result.merged, /MINE/);
    assert.match(result.merged, /TEMPLATE/);
  });

  it("reports a conflict and marks it up when both changed the same line", () => {
    const result = mergeThreeWay({
      base: lines(20),
      ours: lines(20, { 10: "MINE" }),
      theirs: lines(20, { 10: "TEMPLATE" }),
      labels: { ours: "your App.tsx", theirs: "create-rn-app 1.2.0" },
    });

    assert.equal(result.clean, false);
    assert.ok(result.conflicts > 0);
    assert.match(result.merged, /<<<<<<< your App\.tsx/);
    assert.match(result.merged, />>>>>>> create-rn-app 1\.2\.0/);
    // --diff3 keeps the original in the middle, which is what makes a conflict
    // resolvable without digging the old file out of git.
    assert.match(result.merged, /\|\|\|\|\|\|\| original/);
  });

  it("short-circuits identical inputs without shelling out", () => {
    const same = lines(5);
    const result = mergeThreeWay({ base: same, ours: same, theirs: same });
    assert.equal(result.merged, same);
    assert.equal(result.clean, true);
    assert.equal(result.unchanged, true);
  });
});
