const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
} = require("../../src/features/ui-kit/catalog");

describe("ui-kit catalog", () => {
  it("lists All plus every component", () => {
    const choices = getUiKitPromptChoices();
    assert.equal(choices[0].value, UI_KIT_ALL);
    assert.equal(choices.length, UI_TEMPLATE_COMPONENTS.length + 1);
  });

  it("resolves All to every component", () => {
    const resolved = resolveUiKitComponents([UI_KIT_ALL]);
    assert.equal(resolved.length, UI_TEMPLATE_COMPONENTS.length);
    assert.deepEqual(
      resolved.map(item => item.id),
      UI_TEMPLATE_COMPONENTS.map(item => item.id)
    );
  });

  it("resolves a single id and ignores unknown ones", () => {
    const resolved = resolveUiKitComponents(["turbo-image", "missing"]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, "turbo-image");
  });

  it("returns empty for no selection", () => {
    assert.deepEqual(resolveUiKitComponents([]), []);
    assert.deepEqual(resolveUiKitComponents(null), []);
  });
});
