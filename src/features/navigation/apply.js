const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

async function copyNavigationTemplate(projectPath, navigationMode) {
  const sourceNavigationPath = path.join(TEMPLATE_PRESETS, "navigation");

  // Check if source directory exists
  if (!(await fs.pathExists(sourceNavigationPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Navigation template directory not found: ${sourceNavigationPath}. Skipping navigation template copy.`
      )
    );
    return;
  }

  const targetNavigationPath = path.join(projectPath, "src/ui/navigation");
  await fs.ensureDir(path.dirname(targetNavigationPath));

  if (navigationMode === "with-auth") {
    // Copy full navigation (RootNavigator, AuthNavigator, AppNavigator, types, index)
    // Filter out any files with suffixes like -app-only, -with-auth, etc.
    if (await fs.pathExists(sourceNavigationPath)) {
      await fs.copy(sourceNavigationPath, targetNavigationPath, {
        overwrite: true,
        filter: src => {
          const fileName = path.basename(src);
          // Exclude files with suffixes like -app-only, -with-auth, etc.
          if (
            fileName.includes("-app-only") ||
            fileName.includes("-with-auth")
          ) {
            return false;
          }
          return true;
        },
      });
      console.log(
        chalk.green("✅ Copied full navigation template (with auth)")
      );
    }
  } else if (navigationMode === "app-only") {
    // Copy only AppNavigator and generate app-only versions of types and index
    await fs.ensureDir(targetNavigationPath);

    // Copy AppNavigator.tsx
    const appNavigatorSource = path.join(
      sourceNavigationPath,
      "AppNavigator.tsx"
    );
    const appNavigatorTarget = path.join(
      targetNavigationPath,
      "AppNavigator.tsx"
    );
    if (await fs.pathExists(appNavigatorSource)) {
      await fs.copy(appNavigatorSource, appNavigatorTarget, {
        overwrite: true,
      });
    }

    // Generate types.ts for app-only (without RootRoutes and AuthRoutes)
    const typesTarget = path.join(targetNavigationPath, "types.ts");
    const typesContent = `import type { RouteProp } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

export const enum AppRoutes {
  HOME = "HOME",
}

export type AppStackParamList = {
  [AppRoutes.HOME]: undefined;
};

export type AppStackRouteProp<T extends keyof AppStackParamList = AppRoutes> =
  RouteProp<AppStackParamList, T>;
export type AppStackScreenProps<T extends keyof AppStackParamList = AppRoutes> =
  NativeStackScreenProps<AppStackParamList, T>;
export type AppStackNavigationProp<
  T extends keyof AppStackParamList = AppRoutes
> = NativeStackNavigationProp<AppStackParamList, T>;
`;
    await fs.writeFile(typesTarget, typesContent, "utf8");

    // Generate index.ts for app-only (export only AppNavigator)
    const indexTarget = path.join(targetNavigationPath, "index.ts");
    const indexContent = `export { AppNavigator } from "./AppNavigator";
`;
    await fs.writeFile(indexTarget, indexContent, "utf8");

    console.log(
      chalk.green("✅ Copied navigation template (app-only, no auth)")
    );
  }
}

async function apply(ctx) {
  const { projectPath, navigationMode } = ctx.config;
  if (navigationMode === "with-auth" || navigationMode === "app-only") {
    await copyNavigationTemplate(projectPath, navigationMode);
  }
}

module.exports = { apply, copyNavigationTemplate };
