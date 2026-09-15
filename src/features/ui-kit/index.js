const { prompt } = require("./prompt");
const { apply, copyUiKit } = require("./apply");
const {
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
} = require("./catalog");

const meta = {
  id: "ui-kit",
  title: "UI kit",
  description: "Ready-made components copied into src/ui/components",
  addable: true,
};

function isInstalled(config) {
  return Boolean(config?.uiKit?.enabled);
}

module.exports = {
  meta,
  isInstalled,
  prompt,
  apply,
  copyUiKit,
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
};
