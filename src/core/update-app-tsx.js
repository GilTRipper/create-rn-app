const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

async function updateAppTsxForSetup(
  projectPath,
  { navigationMode, localizationEnabled, themeEnabled, messagingEnabled, mapboxToken }
) {
  const appTsxPath = path.join(projectPath, "App.tsx");

  if (!(await fs.pathExists(appTsxPath))) {
    console.log(
      chalk.yellow(
        `⚠️  App.tsx not found: ${appTsxPath}. Skipping App.tsx update.`
      )
    );
    return;
  }

  if (
    navigationMode === "none" &&
    !localizationEnabled &&
    !themeEnabled &&
    !messagingEnabled
  ) {
    // Keep template App.tsx as-is
    return;
  }

  const usesNav =
    navigationMode === "with-auth" || navigationMode === "app-only";

  const navigatorImport =
    navigationMode === "with-auth"
      ? 'import { RootNavigator } from "~/ui/navigation";'
      : navigationMode === "app-only"
      ? 'import { AppNavigator } from "~/ui/navigation";'
      : "";

  // A complete `return` statement, so it can only ever be a function body.
  // Inlining it inside JSX turns "return (" into a text child, which React
  // Native rejects at runtime with "Text strings must be rendered within a
  // <Text> component" - the provider branches below each wrap an inner
  // AppContent component instead.
  const contentJsx = usesNav
    ? navigationMode === "with-auth"
      ? `  return (\n    <NavigationContainer>\n      <RootNavigator />\n    </NavigationContainer>\n  );`
      : `  return (\n    <NavigationContainer>\n      <AppNavigator />\n    </NavigationContainer>\n  );`
    : `  return <View />;`;

  // Build provider wrappers
  const themeProviderImport = themeEnabled
    ? 'import { ThemeProvider } from "~/lib/theme";\n'
    : "";
  const localizationProviderImport = localizationEnabled
    ? 'import { LocalizationProvider, useLocalization } from "~/lib/localization";\n'
    : "";
  const notificationsImport = messagingEnabled
    ? 'import { useHandlePushNotificationToken } from "~/notifications";\n'
    : "";

  // Only import what the chosen combination actually renders, otherwise
  // eslint fails the generated app on no-unused-vars right after scaffolding.
  const navigationContainerImport = usesNav
    ? 'import { NavigationContainer } from "@react-navigation/native";\n'
    : "";
  const viewImport = usesNav ? "" : 'import { View } from "react-native";\n';

  const mapboxImport = mapboxToken !== undefined
    ? `import Mapbox from "@rnmapbox/maps";\n`
    : "";
  const mapboxInit = mapboxToken !== undefined
    ? mapboxToken
      ? `Mapbox.setAccessToken("${mapboxToken}");\n\n`
      : `Mapbox.setAccessToken("<MAPBOX_ACCESS_TOKEN>");\n\n`
    : "";

  if (localizationEnabled && themeEnabled) {
    // Both localization and theme
    const appTsxContent = `${mapboxImport}${navigationContainerImport}import { useEffect } from "react";
${viewImport}import RNBootSplash from "react-native-bootsplash";
${mapboxInit}${themeProviderImport}${localizationProviderImport}${notificationsImport}${navigatorImport}

const AppContent = () => {
  const { initLocalization } = useLocalization();
  ${
    messagingEnabled
      ? "  const { setNotifications } = useHandlePushNotificationToken();\n"
      : ""
  }

  useEffect(() => {
    const appBoot = async () => {
      await initLocalization();
      ${messagingEnabled ? "      await setNotifications();\n" : ""}
      RNBootSplash.hide();
    };
    appBoot();
  }, []);

${contentJsx}
};

export const App = () => (
  <ThemeProvider>
    <LocalizationProvider>
      <AppContent />
    </LocalizationProvider>
  </ThemeProvider>
);
`;

    await fs.writeFile(appTsxPath, appTsxContent, "utf8");
    console.log(chalk.green("✅ Updated App.tsx (with ThemeProvider and LocalizationProvider)"));
    return;
  }

  if (localizationEnabled) {
    // Only localization
    const appTsxContent = `${mapboxImport}${navigationContainerImport}import { useEffect } from "react";
${viewImport}import RNBootSplash from "react-native-bootsplash";
${mapboxInit}${localizationProviderImport}${notificationsImport}${navigatorImport}

const AppContent = () => {
  const { initLocalization } = useLocalization();
  ${
    messagingEnabled
      ? "  const { setNotifications } = useHandlePushNotificationToken();\n"
      : ""
  }

  useEffect(() => {
    const appBoot = async () => {
      await initLocalization();
      ${messagingEnabled ? "      await setNotifications();\n" : ""}
      RNBootSplash.hide();
    };
    appBoot();
  }, []);

${contentJsx}
};

export const App = () => (
  <LocalizationProvider>
    <AppContent />
  </LocalizationProvider>
);
`;

    await fs.writeFile(appTsxPath, appTsxContent, "utf8");
    console.log(chalk.green("✅ Updated App.tsx (with LocalizationProvider)"));
    return;
  }

  if (themeEnabled) {
    // Only theme
    const appTsxContent = `${mapboxImport}${navigationContainerImport}import { useEffect } from "react";
${viewImport}import RNBootSplash from "react-native-bootsplash";
${mapboxInit}${themeProviderImport}${notificationsImport}${navigatorImport}

const AppContent = () => {
  ${
    messagingEnabled
      ? "  const { setNotifications } = useHandlePushNotificationToken();\n"
      : ""
  }
  useEffect(() => {
    ${messagingEnabled ? "    setNotifications();\n" : ""}
    RNBootSplash.hide();
  }, []);

${contentJsx}
};

export const App = () => (
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>
);
`;

    await fs.writeFile(appTsxPath, appTsxContent, "utf8");
    console.log(chalk.green("✅ Updated App.tsx (with ThemeProvider)"));
    return;
  }

  // No localization or theme: just hide splash on mount
  const appTsxContent = `${mapboxImport}${navigationContainerImport}import { useEffect } from "react";
${viewImport}import RNBootSplash from "react-native-bootsplash";
${mapboxInit}${notificationsImport}${navigatorImport}

export const App = () => {
  ${
    messagingEnabled
      ? "  const { setNotifications } = useHandlePushNotificationToken();\n"
      : ""
  }
  useEffect(() => {
    ${messagingEnabled ? "    setNotifications();\n" : ""}
    RNBootSplash.hide();
  }, []);

${contentJsx}
};
`;

    await fs.writeFile(appTsxPath, appTsxContent, "utf8");
    console.log(chalk.green("✅ Updated App.tsx"));
}

async function updateAppTsx(ctx) {
  const {
    projectPath,
    navigationMode = "none",
    localization = {},
    theme = false,
    firebase = {},
    maps = {},
  } = ctx.config;
  const localizationEnabled = localization?.enabled || false;
  const themeEnabled = theme || false;
  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const messagingEnabled =
    firebaseEnabled && Array.isArray(firebaseModules)
      ? firebaseModules.includes("messaging")
      : false;
  const enableMapbox = maps?.provider === "mapbox";
  const mapboxToken = maps?.mapboxToken || null;

  await updateAppTsxForSetup(projectPath, {
    navigationMode,
    localizationEnabled,
    themeEnabled,
    messagingEnabled,
    mapboxToken: enableMapbox ? mapboxToken : undefined,
  });
}

module.exports = { updateAppTsx, updateAppTsxForSetup };
