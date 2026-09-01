const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { generateProject, cleanup } = require("../helpers/generate");
const { exists, readText } = require("../helpers/fs");

describe("zustand storage", () => {
  let projectPath;

  before(async () => {
    ({ projectPath } = await generateProject("e2e-storage", {
      zustandStorage: true,
    }));
  });

  after(() => cleanup(projectPath));

  it("writes src/lib/storage.ts with the MMKV adapter", () => {
    assert.ok(exists(projectPath, "src/lib/storage.ts"));
    const content = readText(projectPath, "src/lib/storage.ts");
    assert.ok(content.includes('import { createMMKV } from "react-native-mmkv"'));
    assert.ok(content.includes('import type { StateStorage } from "zustand/middleware"'));
    assert.ok(content.includes("const storage = createMMKV()"));
    assert.ok(content.includes("export const zustandStorage: StateStorage"));
    assert.ok(content.includes("storage.set(name, value)"));
    assert.ok(content.includes("storage.getString(name)"));
    assert.ok(content.includes("return value ?? null"));
    assert.ok(content.includes("storage.remove(name)"));
  });
});
