const { test } = require("./test-helpers");
const { isNodeVersionSupported } = require("../src/utils");

module.exports = function runNodeVersionTests() {
  test("Check Node 20.x is rejected", () => {
    if (isNodeVersionSupported("20.19.5")) {
      throw new Error("Node 20.19.5 should not be supported");
    }
  });

  test("Check Node 22.10 is rejected", () => {
    if (isNodeVersionSupported("22.10.0")) {
      throw new Error("Node 22.10.0 is below RN 0.86 floor 22.11.0");
    }
  });

  test("Check Node 22.11.0 is accepted", () => {
    if (!isNodeVersionSupported("22.11.0")) {
      throw new Error("Node 22.11.0 should be supported");
    }
  });

  test("Check Node 22.14 and 24 are accepted", () => {
    if (!isNodeVersionSupported("22.14.0")) {
      throw new Error("Node 22.14.0 should be supported");
    }
    if (!isNodeVersionSupported("24.1.0")) {
      throw new Error("Node 24.1.0 should be supported");
    }
  });
};
