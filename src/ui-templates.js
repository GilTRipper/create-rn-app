const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

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

async function addUiKitDependencies(projectPath, components) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) {
    return;
  }

  const deps = {};
  for (const component of components) {
    Object.assign(deps, component.dependencies);
  }

  if (Object.keys(deps).length === 0) {
    return;
  }

  const packageData = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  packageData.dependencies = {
    ...(packageData.dependencies || {}),
    ...deps,
  };

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
  console.log(
    chalk.green(`✅ Added UI kit dependencies: ${Object.keys(deps).join(", ")}`)
  );
}

async function copyUiKit(projectPath, componentIds = []) {
  const components = resolveUiKitComponents(componentIds);
  if (components.length === 0) {
    return;
  }

  const sourceRoot = path.join(__dirname, "../ui-templates");
  const destRoot = path.join(projectPath, "src/ui/components");

  if (!(await fs.pathExists(sourceRoot))) {
    console.log(
      chalk.yellow(
        `⚠️  UI templates directory not found: ${sourceRoot}. Skipping UI kit copy.`
      )
    );
    return;
  }

  const byFolder = {};

  for (const component of components) {
    const from = path.join(sourceRoot, component.source);
    const to = path.join(destRoot, component.dest);

    if (!(await fs.pathExists(from))) {
      console.log(
        chalk.yellow(`⚠️  UI template not found: ${component.source}. Skipping.`)
      );
      continue;
    }

    await fs.ensureDir(path.dirname(to));
    await fs.copy(from, to, { overwrite: true });

    const folder = path.posix.dirname(component.dest.replace(/\\/g, "/"));
    byFolder[folder] = byFolder[folder] || [];
    byFolder[folder].push(component);
    console.log(chalk.green(`✅ Copied UI component: ${component.name}`));
  }

  const folders = Object.keys(byFolder);
  if (folders.length === 0) {
    return;
  }

  for (const folder of folders) {
    const indexPath = path.join(destRoot, folder, "index.ts");
    const content =
      byFolder[folder].map(component => component.indexExport).join("\n") +
      "\n";
    await fs.writeFile(indexPath, content, "utf8");
  }

  const rootIndex =
    folders.map(folder => `export * from "./${folder}";`).join("\n") + "\n";
  await fs.writeFile(path.join(destRoot, "index.ts"), rootIndex, "utf8");

  await addUiKitDependencies(projectPath, components);
}

module.exports = {
  UI_KIT_ALL,
  UI_TEMPLATE_COMPONENTS,
  getUiKitPromptChoices,
  resolveUiKitComponents,
  copyUiKit,
};
