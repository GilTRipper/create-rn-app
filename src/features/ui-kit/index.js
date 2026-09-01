const { prompt } = require("./prompt");
const { apply, copyUiKit } = require("./apply");
const {
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
} = require("./catalog");

module.exports = {
  prompt,
  apply,
  copyUiKit,
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
};
