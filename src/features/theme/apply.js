const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

async function copyThemeTemplate(projectPath) {
  const sourceThemePath = path.join(TEMPLATE_PRESETS, "theme");

  if (!(await fs.pathExists(sourceThemePath))) {
    console.log(
      chalk.yellow(
        `⚠️  Theme template directory not found: ${sourceThemePath}. Skipping theme template copy.`
      )
    );
    return;
  }

  const targetThemePath = path.join(projectPath, "src/lib/theme");
  await fs.ensureDir(path.dirname(targetThemePath));

  await fs.copy(sourceThemePath, targetThemePath, {
    overwrite: true,
  });
  console.log(chalk.green("✅ Copied theme template"));
}

async function configureTheme(projectPath, useZustand = true) {
  const targetThemePath = path.join(projectPath, "src/lib/theme");
  const storePath = path.join(targetThemePath, "store/index.ts");
  const providerPath = path.join(targetThemePath, "provider.tsx");

  const storeContent = useZustand
    ? `import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "~/lib/storage";
import type { ThemeState } from "../types";

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      theme: "system",
      setTheme: theme => set({ theme }),
    }),
    { name: "theme", storage: createJSONStorage(() => zustandStorage) },
  ),
);
`
    : `// Store not needed - using useState in provider instead
export {};
`;

  // Update provider to use useState if not using zustand
  let providerContent = await fs.readFile(providerPath, "utf8");
  if (!useZustand) {
    // Remove import for useThemeStore from store
    providerContent = providerContent.replace(
      /import { useThemeStore } from "\.\/store";\n/g,
      ""
    );
    // Replace useThemeStore with useState
    providerContent = providerContent.replace(
      /  const scheme = useColorScheme\(\);\n  const { theme: selectedTheme } = useThemeStore\(\);/,
      `  const scheme = useColorScheme();
  const [selectedTheme, setSelectedTheme] = useState("system");`
    );
  }

  await fs.writeFile(storePath, storeContent, "utf8");
  await fs.writeFile(providerPath, providerContent, "utf8");

  console.log(chalk.green(`✅ Configured theme support (${useZustand ? "with Zustand storage" : "with simple state"})`));
}


async function apply(ctx) {
  const { projectPath, theme, zustandStorage } = ctx.config;
  if (!theme) {
    return;
  }
  await copyThemeTemplate(projectPath);
  await configureTheme(projectPath, zustandStorage);
}

module.exports = { apply, copyThemeTemplate, configureTheme };
