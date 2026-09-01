const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  capitalize,
  getEnvNameForScheme,
  generateXcodeId,
  genId,
  generateUuid,
} = require("../../src/shared/xcode");

describe("shared/xcode", () => {
  it("capitalizes env names for schemes", () => {
    assert.equal(capitalize("staging"), "Staging");
    assert.equal(getEnvNameForScheme("production"), "Production");
  });

  it("generates 24-char hex Xcode ids", () => {
    const id = generateXcodeId();
    assert.match(id, /^[0-9A-F]{24}$/);
    assert.notEqual(id, generateXcodeId());
  });

  it("generates 24-char genId and a non-empty uuid", () => {
    assert.match(genId(), /^[0-9A-F]{24}$/);
    assert.ok(generateUuid().length > 8);
  });
});
