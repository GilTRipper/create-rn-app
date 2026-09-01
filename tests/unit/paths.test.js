const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  TEMPLATE_DIR,
  TEMPLATE_PRESETS,
  UI_TEMPLATES_DIR,
  ensureAbsolutePath,
  validateExistingDir,
  resolveOptionalDir,
} = require("../../src/shared/paths");

describe("shared/paths", () => {
  it("points at real template directories", () => {
    assert.ok(fs.existsSync(TEMPLATE_DIR));
    assert.ok(fs.existsSync(TEMPLATE_PRESETS));
    assert.ok(fs.existsSync(UI_TEMPLATES_DIR));
  });

  it("ensureAbsolutePath keeps absolute paths and resolves relative ones", () => {
    const abs = path.join(os.tmpdir(), "create-rn-abs");
    assert.equal(ensureAbsolutePath(abs), path.normalize(abs));
    assert.equal(
      ensureAbsolutePath("relative-dir"),
      path.normalize(path.join(process.cwd(), "relative-dir"))
    );
  });

  it("resolveOptionalDir returns null for empty input", () => {
    assert.equal(resolveOptionalDir(""), null);
    assert.equal(resolveOptionalDir("   "), null);
    assert.equal(resolveOptionalDir(null), null);
  });

  it("validateExistingDir accepts empty and existing dirs", async () => {
    assert.equal(await validateExistingDir(""), true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-rn-path-"));
    try {
      assert.equal(await validateExistingDir(dir), true);
      assert.equal(await validateExistingDir(path.join(dir, "missing")), "Directory does not exist");
      const filePath = path.join(dir, "file.txt");
      fs.writeFileSync(filePath, "x");
      assert.equal(await validateExistingDir(filePath), "Path is not a directory");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
