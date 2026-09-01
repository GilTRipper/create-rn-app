const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { UI_TEMPLATES_DIR } = require("../../shared/paths");
const { resolveUiKitComponents } = require("./catalog");

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

  const sourceRoot = UI_TEMPLATES_DIR;
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

async function apply(ctx) {
  const { projectPath, uiKit = {} } = ctx.config;
  const uiKitEnabled = uiKit?.enabled || false;
  const uiKitComponents = Array.isArray(uiKit?.components)
    ? uiKit.components
    : [];
  if (uiKitEnabled && uiKitComponents.length > 0) {
    await copyUiKit(projectPath, uiKitComponents);
  }
}

module.exports = { apply, copyUiKit };
