const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseVersion, compareVersions } = require("../../src/shared/version");

describe("shared/version", () => {
  it("parses major.minor.patch", () => {
    assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
    assert.deepEqual(parseVersion("1.1.6"), [1, 1, 6]);
  });

  it("fills in missing and unparsable parts with zero", () => {
    assert.deepEqual(parseVersion("2"), [2, 0, 0]);
    assert.deepEqual(parseVersion("2.1"), [2, 1, 0]);
    assert.deepEqual(parseVersion(""), [0, 0, 0]);
    assert.deepEqual(parseVersion(undefined), [0, 0, 0]);
  });

  it("ignores prerelease and build metadata", () => {
    assert.deepEqual(parseVersion("1.2.3-beta.1"), [1, 2, 3]);
    assert.deepEqual(parseVersion("1.2.3+build5"), [1, 2, 3]);
    assert.equal(compareVersions("1.2.3-beta.1", "1.2.3"), 0);
  });

  it("orders versions numerically, not as strings", () => {
    assert.equal(compareVersions("1.2.0", "1.10.0"), -1);
    assert.equal(compareVersions("1.10.0", "1.2.0"), 1);
    assert.equal(compareVersions("1.1.6", "1.1.6"), 0);
    assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
    assert.equal(compareVersions("1.1.6", "1.2.0"), -1);
  });
});
