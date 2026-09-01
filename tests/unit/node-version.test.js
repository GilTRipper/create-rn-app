const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isNodeVersionSupported } = require("../../src/utils");

describe("isNodeVersionSupported", () => {
  it("rejects Node 20", () => {
    assert.equal(isNodeVersionSupported("20.19.5"), false);
  });

  it("rejects Node 22.10 (below 22.11.0)", () => {
    assert.equal(isNodeVersionSupported("22.10.0"), false);
  });

  it("accepts Node 22.11.0", () => {
    assert.equal(isNodeVersionSupported("22.11.0"), true);
  });

  it("accepts Node 22.14 and 24", () => {
    assert.equal(isNodeVersionSupported("22.14.0"), true);
    assert.equal(isNodeVersionSupported("24.1.0"), true);
  });

  it("rejects non-numeric versions", () => {
    assert.equal(isNodeVersionSupported("not-a-version"), false);
  });
});
