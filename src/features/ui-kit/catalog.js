const UI_KIT_ALL = "__ALL__";

const UI_TEMPLATE_COMPONENTS = [
  {
    id: "turbo-image",
    name: "TurboImage",
    source: "atoms/TurboImage.tsx",
    dest: "atoms/TurboImage.tsx",
    indexExport: 'export { TurboImage } from "./TurboImage";',
    dependencies: {
      "react-native-turbo-image": "^1.24.3",
    },
  },
  {
    id: "liquid-glass",
    name: "Liquid Glass",
    source: "atoms/LiquidGlassView.tsx",
    dest: "atoms/LiquidGlassView.tsx",
    indexExport:
      'export { LiquidGlassView, AnimatedLiquidGlassView } from "./LiquidGlassView";',
    dependencies: {
      "@callstack/liquid-glass": "^0.8.1",
    },
  },
];

function getUiKitPromptChoices() {
  return [
    { name: "All", value: UI_KIT_ALL },
    ...UI_TEMPLATE_COMPONENTS.map(component => ({
      name: component.name,
      value: component.id,
    })),
  ];
}

function resolveUiKitComponents(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  if (ids.includes(UI_KIT_ALL)) {
    return [...UI_TEMPLATE_COMPONENTS];
  }

  const wanted = new Set(ids);
  return UI_TEMPLATE_COMPONENTS.filter(component => wanted.has(component.id));
}

module.exports = {
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
};
