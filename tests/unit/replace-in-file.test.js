const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { replaceInFile } = require("../../src/utils");

describe("replaceInFile", () => {
  it("replaces every occurrence in a file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-replace-"));
    const filePath = path.join(dir, "app.json");
    fs.writeFileSync(filePath, '{"name":"HelloWorld","slug":"helloworld"}');

    try {
      await replaceInFile(filePath, {
        HelloWorld: "DemoApp",
        helloworld: "demoapp",
      });
      const content = fs.readFileSync(filePath, "utf8");
      assert.equal(content, '{"name":"DemoApp","slug":"demoapp"}');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw when the file is missing", async () => {
    await replaceInFile(path.join(os.tmpdir(), "missing-create-rn.json"), {
      HelloWorld: "X",
    });
  });
});
