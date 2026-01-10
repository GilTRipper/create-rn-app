const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const execa = require("execa");
const crypto = require("crypto");
const { replaceInFile } = require("./utils");

const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

// Get proper environment name for schemes/targets (staging -> Staging, development -> Development, etc.)
function getEnvNameForScheme(env) {
  return capitalize(env);
}

async function ensureManifestPackage(manifestPath, bundleIdentifier) {
  if (!(await fs.pathExists(manifestPath))) {
    console.log(
      chalk.yellow(`⚠️  AndroidManifest.xml does not exist: ${manifestPath}`)
    );
    return;
  }

  let manifestContent = await fs.readFile(manifestPath, "utf8");

  // Check if package attribute already exists
  if (manifestContent.includes(`package="${bundleIdentifier}"`)) {
    // Already has correct package
    return;
  }

  // Check if package attribute exists but with different value
  const packageRegex = /package="[^"]+"/;
  if (packageRegex.test(manifestContent)) {
    // Replace existing package
    manifestContent = manifestContent.replace(
      packageRegex,
      `package="${bundleIdentifier}"`
    );
  } else {
    // Add package attribute to manifest tag
    manifestContent = manifestContent.replace(
      /<manifest\s+xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"([^>]*)>/,
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundleIdentifier}"$1>`
    );
  }

  await fs.writeFile(manifestPath, manifestContent, "utf8");
}

function getGoogleFilesByEnv(firebaseConfig) {
  if (!firebaseConfig || !firebaseConfig.filesByEnv) {
    return {};
  }
  return firebaseConfig.filesByEnv;
}

async function copyFirebaseLibModules(projectPath, modules = []) {
  if (!modules || modules.length === 0) {
    return;
  }

  const sourceLibPath = path.join(__dirname, "firebase-lib-modules");

  // Check if source directory exists
  if (!(await fs.pathExists(sourceLibPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Firebase lib modules directory not found: ${sourceLibPath}. Skipping Firebase lib modules copy.`
      )
    );
    return;
  }

  const targetLibPath = path.join(projectPath, "src/lib");
  await fs.ensureDir(targetLibPath);

  // Copy analytics if selected
  if (modules.includes("analytics")) {
    const sourceAnalyticsPath = path.join(sourceLibPath, "analytics");
    const targetAnalyticsPath = path.join(targetLibPath, "analytics");

    if (await fs.pathExists(sourceAnalyticsPath)) {
      await fs.copy(sourceAnalyticsPath, targetAnalyticsPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied analytics lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Analytics source directory not found: ${sourceAnalyticsPath}`
        )
      );
    }
  }

  // Copy remote-config if selected
  if (modules.includes("remote-config")) {
    const sourceRemoteConfigPath = path.join(sourceLibPath, "remote-config");
    const targetRemoteConfigPath = path.join(targetLibPath, "remote-config");

    if (await fs.pathExists(sourceRemoteConfigPath)) {
      await fs.copy(sourceRemoteConfigPath, targetRemoteConfigPath, {
        overwrite: true,
      });
      console.log(chalk.green("✅ Copied remote-config lib module"));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Remote Config source directory not found: ${sourceRemoteConfigPath}`
        )
      );
    }
  }
}

async function copyAuthTemplate(projectPath) {
  const sourceAuthPath = path.join(__dirname, "../template-presets/auth");

  // Check if source directory exists
  if (!(await fs.pathExists(sourceAuthPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Auth template directory not found: ${sourceAuthPath}. Skipping auth template copy.`
      )
    );
    return;
  }

  const targetAuthPath = path.join(projectPath, "src/auth");
  await fs.ensureDir(path.dirname(targetAuthPath));

  if (await fs.pathExists(sourceAuthPath)) {
    await fs.copy(sourceAuthPath, targetAuthPath, {
      overwrite: true,
    });
    console.log(chalk.green("✅ Copied auth template"));
  } else {
    console.log(
      chalk.yellow(`⚠️  Auth source directory not found: ${sourceAuthPath}`)
    );
  }
}

async function copyNavigationTemplate(projectPath, navigationMode) {
  const sourceNavigationPath = path.join(
    __dirname,
    "../template-presets/navigation"
  );

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

async function addLocalizationDependencies(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  packageData.dependencies = packageData.dependencies || {};

  // Versions aligned with lepimvarim
  const localizationDeps = {
    i18next: "^25.7.3",
    "i18next-icu": "^2.4.1",
    "react-i18next": "^16.5.0",
  };

  packageData.dependencies = {
    ...packageData.dependencies,
    ...localizationDeps,
  };

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function copyLocalizationTemplate(projectPath) {
  const sourceLocalizationPath = path.join(
    __dirname,
    "../template-presets/localization"
  );

  if (!(await fs.pathExists(sourceLocalizationPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Localization template directory not found: ${sourceLocalizationPath}. Skipping localization template copy.`
      )
    );
    return;
  }

  const targetLocalizationPath = path.join(projectPath, "src/lib/localization");
  await fs.ensureDir(path.dirname(targetLocalizationPath));

  await fs.copy(sourceLocalizationPath, targetLocalizationPath, {
    overwrite: true,
  });
  console.log(chalk.green("✅ Copied localization template"));
}

async function configureLocalization(
  projectPath,
  defaultLanguage,
  withRemoteConfig = false
) {
  const lang = String(defaultLanguage || "ru").trim();
  const targetLocalizationPath = path.join(projectPath, "src/lib/localization");
  const languagesDir = path.join(targetLocalizationPath, "languages");
  await fs.ensureDir(languagesDir);

  // Create first language file in languages/ (based on selected default language)
  const languageFilePath = path.join(languagesDir, `${lang}.json`);
  const languageJson = {
    global: {
      hello: lang.toLowerCase().startsWith("ru") ? "Привет" : "Hello",
    },
  };

  await fs.writeFile(
    languageFilePath,
    JSON.stringify(languageJson, null, 2) + "\n",
    "utf8"
  );

  // Remove default ru.json from preset if different (or keep only selected file)
  const presetRuPath = path.join(languagesDir, "ru.json");
  if (await fs.pathExists(presetRuPath)) {
    if (lang !== "ru") {
      await fs.remove(presetRuPath);
    }
  }

  // Rewrite provider.tsx / types.ts / store to use selected default language
  const providerPath = path.join(targetLocalizationPath, "provider.tsx");
  const typesPath = path.join(targetLocalizationPath, "types.ts");
  const storePath = path.join(targetLocalizationPath, "store/index.ts");

  // Build provider content based on whether remote-config is enabled
  const remoteConfigImport = withRemoteConfig
    ? `import { useRemoteConfig } from "~/lib/remote-config";\n`
    : "";
  const remoteConfigHook = withRemoteConfig
    ? `  const remoteConfig = useRemoteConfig();\n\n`
    : "";

  const deepMergeHelper = withRemoteConfig
    ? `const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const deepMerge = <T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T => {
  const out: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = out[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      out[key] = deepMerge(baseValue, value);
    } else {
      out[key] = value;
    }
  }

  return out as T;
};

`
    : "";

  const initLocalizationBody = withRemoteConfig
    ? `    let lng = language;

    if (!lng) {
      lng = getLocales()[0].languageCode;
      setLanguage(lng);
    }

    // Get all localizations from Remote Config at once
    const defaults: Record<string, string> = {
      ${JSON.stringify(lang)}: JSON.stringify(translations),
    };

    const allRemoteLocalizations = await remoteConfig.getAllJSON<Record<string, typeof translations>>({
      defaults,
    });

    // Collect resources for all languages from Remote Config
    const resources: Record<string, { translation: typeof translations }> = {};

    // Merge all localizations from Remote Config
    for (const [langCode, remoteTranslation] of Object.entries(allRemoteLocalizations)) {
      if (langCode === ${JSON.stringify(lang)}) {
        // For default language, merge with local file
        resources[langCode] = {
          translation: deepMerge(translations, remoteTranslation as unknown as Record<string, unknown>),
        };
      } else {
        // For other languages, use only remote
        resources[langCode] = { translation: remoteTranslation };
      }
    }

    // If current language is ${JSON.stringify(
      lang
    )} and it's not in remote, use local
    if (!resources[lng] && lng === ${JSON.stringify(lang)}) {
      resources[lng] = { translation: translations };
    }

    // Add all resources to i18n and change language
    for (const [langCode, resource] of Object.entries(resources)) {
      i18n.addResourceBundle(langCode, "translation", resource.translation, true, true);
    }

    await i18n.changeLanguage(lng);`
    : `    let lng = language;

    if (!lng) {
      lng = getLocales()[0].languageCode;
      setLanguage(lng);
    }

    await i18n.use(initReactI18next).use(ICU).init({
      // add all languages your app supports (from languages folder)
      resources: { ${JSON.stringify(lang)}: { translation: translations } },
      lng,
      fallbackLng: ${JSON.stringify(lang)},
      interpolation: { escapeValue: false },
    });`;

  const i18nInit = withRemoteConfig
    ? `  const { language, setLanguage } = useLocalizationStore();
  const { getLocales } = useLocalize();

  // Initialize i18n synchronously with basic config before using useTranslation
  if (!i18n.isInitialized) {
    i18n
      .use(initReactI18next)
      .use(ICU)
      .init({
        resources: { ${JSON.stringify(lang)}: { translation: translations } },
        lng: language || getLocales()[0]?.languageCode || ${JSON.stringify(
          lang
        )},
        fallbackLng: ${JSON.stringify(lang)},
        interpolation: { escapeValue: false },
      });
  }

  const { t: rawT } = useTranslation();`
    : `  const { t: rawT } = useTranslation();

  const { language, setLanguage } = useLocalizationStore();
  const { getLocales } = useLocalize();`;

  const providerContent = `import React, { createContext, useContext } from "react";
import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next, useTranslation } from "react-i18next";
import { useLocalize } from "react-native-localize";
import translations from "./languages/${lang}.json";
import { useLocalizationStore } from "./store";
${remoteConfigImport}import type { I18nContextProps, LocalizationContextProps, TranslationComponents } from "./types";
import type { ReactNode } from "react";

const LocalizationContext = createContext<LocalizationContextProps | undefined>(undefined);

${deepMergeHelper}const parseWithComponents = (str: string, components: TranslationComponents): ReactNode => {
  const regex = /<(\\w+)>(.*?)<\\/\\1>/gs;
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of str.matchAll(regex)) {
    const [fullMatch, tagName, innerContent] = match;
    const index = match.index!;

    if (index > lastIndex) {
      parts.push(str.slice(lastIndex, index));
    }

    const inner = parseWithComponents(innerContent, components);

    parts.push(components[tagName]?.(inner) ?? fullMatch);

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < str.length) {
    parts.push(str.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
};

// Don't forget to wrap your app with this provider
export const LocalizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
${i18nInit}
${remoteConfigHook}
  const rich: I18nContextProps["rich"] = (key, components, options?) => {
    const str = rawT(key, options);

    return parseWithComponents(str, components);
  };

  const initLocalization = async () => {
${initLocalizationBody}
  };

  const changeLanguage = async (newLanguage: string) => {
    await i18n.changeLanguage(newLanguage);
    setLanguage(newLanguage);
  };

  return (
    <LocalizationContext.Provider value={{ t: rawT, rich, initLocalization, changeLanguage }}>{children}</LocalizationContext.Provider>
  );
};

export const useLocalization = (): LocalizationContextProps => {
  const context = useContext(LocalizationContext);

  if (!context) {
    throw new Error("useLocalization must be used within LocalizationProvider");
  }

  return context;
};
`;

  const typesContent = `import type { ReactNode } from "react";
import type translations from "./languages/${lang}.json";

export type Join<K, P> = K extends string | number ? (P extends string | number ? \`\${K}.\${P}\` : never) : never;
export type FinalPaths<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: T[K] extends object ? Join<K, FinalPaths<T[K]>> : K;
    }[keyof T & (string | number)]
  : never;
export type TranslationKey = FinalPaths<typeof translations>;

export type TranslationOptions = Record<string, string | number> | undefined;

export type TranslationComponents = Record<string, (_: ReactNode) => ReactNode>;

export type I18nContextProps = {
  t: (key: TranslationKey, options?: TranslationOptions) => string;
  rich: (key: TranslationKey, components: TranslationComponents, options?: TranslationOptions) => ReactNode;
};

export type TranslationType = I18nContextProps;

export type LocalizationContextProps = I18nContextProps & {
  initLocalization: () => Promise<void>;
  changeLanguage: (language: string) => void;
};

export type LocalizationState = {
  language: string;
  setLanguage: (language: string) => void;
};
`;

  const storeContent = `import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "~/lib/storage";
import type { LocalizationState } from "~/lib/localization/types";

export const useLocalizationStore = create<LocalizationState>()(
  persist(
    set => ({
      language: ${JSON.stringify(lang)},
      setLanguage: language => set(state => ({ ...state, language })),
    }),
    { name: "localization", storage: createJSONStorage(() => zustandStorage) },
  ),
);
`;

  await fs.writeFile(providerPath, providerContent, "utf8");
  await fs.writeFile(typesPath, typesContent, "utf8");
  await fs.writeFile(storePath, storeContent, "utf8");

  console.log(
    chalk.green(`✅ Configured localization (default language: ${lang})`)
  );
}

async function updateAppTsxForSetup(
  projectPath,
  { navigationMode, localizationEnabled }
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

  if (navigationMode === "none" && !localizationEnabled) {
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

  const contentJsx = usesNav
    ? navigationMode === "with-auth"
      ? `  return (\n    <NavigationContainer>\n      <RootNavigator />\n    </NavigationContainer>\n  );`
      : `  return (\n    <NavigationContainer>\n      <AppNavigator />\n    </NavigationContainer>\n  );`
    : `  return <View />;`;

  if (localizationEnabled) {
    const appTsxContent = `import { NavigationContainer } from "@react-navigation/native";
import { useEffect } from "react";
import { View } from "react-native";
import RNBootSplash from "react-native-bootsplash";
import { LocalizationProvider, useLocalization } from "~/lib/localization";
${navigatorImport}

const AppContent = () => {
  const { initLocalization } = useLocalization();

  useEffect(() => {
    const appBoot = async () => {
      await initLocalization();
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

  // No localization: just hide splash on mount
  const appTsxContent = `import { NavigationContainer } from "@react-navigation/native";
import { useEffect } from "react";
import { View } from "react-native";
import RNBootSplash from "react-native-bootsplash";
${navigatorImport}

export const App = () => {
  useEffect(() => {
    RNBootSplash.hide();
  }, []);

${contentJsx}
};
`;

  await fs.writeFile(appTsxPath, appTsxContent, "utf8");
  console.log(chalk.green("✅ Updated App.tsx"));
}

async function addFirebaseDependencies(
  projectPath,
  modules = [],
  bundleIdentifier
) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  packageData.dependencies = packageData.dependencies || {};
  const firebaseDeps = {
    "@react-native-firebase/app": "^23.5.0",
  };
  if (modules.includes("analytics")) {
    firebaseDeps["@react-native-firebase/analytics"] = "^23.5.0";
  }
  if (modules.includes("remote-config")) {
    firebaseDeps["@react-native-firebase/remote-config"] = "^23.5.0";
  }
  if (modules.includes("messaging")) {
    firebaseDeps["@react-native-firebase/messaging"] = "^23.5.0";
  }

  packageData.dependencies = { ...packageData.dependencies, ...firebaseDeps };

  // Add analytics debug script only when analytics is selected
  if (modules.includes("analytics")) {
    packageData.scripts = packageData.scripts || {};
    packageData.scripts["android:debug"] =
      packageData.scripts["android:debug"] ||
      `react-native run-android && cd android && adb shell setprop debug.firebase.analytics.app ${
        bundleIdentifier || "com.helloworld"
      } && cd ..`;
  }

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function ensureGoogleServicesPlugin(projectPath) {
  const rootBuildGradle = path.join(projectPath, "android/build.gradle");
  if (await fs.pathExists(rootBuildGradle)) {
    let content = await fs.readFile(rootBuildGradle, "utf8");
    if (!content.includes("com.google.gms:google-services")) {
      content = content.replace(
        /classpath\("org\.jetbrains\.kotlin:kotlin-gradle-plugin"\)\n/,
        match =>
          `${match}        classpath("com.google.gms:google-services:4.4.2")\n`
      );
      await fs.writeFile(rootBuildGradle, content, "utf8");
    }
  }

  const appBuildGradle = path.join(projectPath, "android/app/build.gradle");
  if (await fs.pathExists(appBuildGradle)) {
    let content = await fs.readFile(appBuildGradle, "utf8");
    if (
      !/apply plugin:\s*['"]com\.google\.gms\.google-services['"]/.test(content)
    ) {
      content = content.replace(
        /apply plugin:\s*"com\.facebook\.react"\n/,
        match => `${match}apply plugin: 'com.google.gms.google-services'\n`
      );
      await fs.writeFile(appBuildGradle, content, "utf8");
    }
  }
}

async function copyFirebaseGoogleFiles(
  googleFilesByEnv,
  projectPath,
  projectName,
  hasMultipleEnvs = false
) {
  if (!googleFilesByEnv || Object.keys(googleFilesByEnv).length === 0) return;

  for (const [env, files] of Object.entries(googleFilesByEnv)) {
    const lowerEnv = env.toLowerCase();
    const isProduction = lowerEnv === "production";

    if (files.androidJson) {
      if (isProduction) {
        // Production goes to android/app/ (root of app folder)
        const androidTargetPath = path.join(
          projectPath,
          "android/app/google-services.json"
        );
        await fs.copy(files.androidJson, androidTargetPath, {
          overwrite: true,
        });
      } else {
        // Other environments go to android/app/src/<env>/
        const androidTargetDir = path.join(
          projectPath,
          `android/app/src/${lowerEnv}`
        );
        await fs.ensureDir(androidTargetDir);
        await fs.copy(
          files.androidJson,
          path.join(androidTargetDir, "google-services.json"),
          { overwrite: true }
        );
      }
    }

    if (files.iosPlist) {
      if (hasMultipleEnvs) {
        // Multiple environments: go to ios/GoogleServices/<env>/
        const iosTargetDir = path.join(
          projectPath,
          `ios/GoogleServices/${lowerEnv}`
        );
        await fs.ensureDir(iosTargetDir);
        await fs.copy(
          files.iosPlist,
          path.join(iosTargetDir, "GoogleService-Info.plist"),
          {
            overwrite: true,
          }
        );
      } else {
        // Single environment: go directly to ios/{projectName}/
        const iosTargetPath = path.join(
          projectPath,
          `ios/${projectName}/GoogleService-Info.plist`
        );
        await fs.copy(files.iosPlist, iosTargetPath, { overwrite: true });
      }
    }
  }
}

async function updatePodfileForFirebase(projectPath, modules = []) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  if (!content.includes("FirebaseCore")) {
    const basePods = [
      "  pod 'FirebaseCore', :modular_headers => true",
      "  pod 'GoogleUtilities', :modular_headers => true",
    ];
    if (modules.includes("analytics")) {
      basePods.push("  $RNFirebaseAnalyticsWithoutAdIdSupport = true");
    }
    if (modules.includes("remote-config")) {
      basePods.push("  pod 'FirebaseRemoteConfig', :modular_headers => true");
      basePods.push("  pod 'FirebaseABTesting', :modular_headers => true");
      basePods.push("  pod 'FirebaseInstallations', :modular_headers => true");
    }

    content = content.replace(
      /use_react_native!\([\s\S]*?\)\n/,
      match => `${match}${basePods.join("\n")}\n`
    );
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAppDelegateForFirebase(projectPath, projectName) {
  const appDelegatePath = path.join(
    projectPath,
    `ios/${projectName}/AppDelegate.swift`
  );
  if (!(await fs.pathExists(appDelegatePath))) return;

  let content = await fs.readFile(appDelegatePath, "utf8");

  if (!content.includes("import Firebase")) {
    content = content.replace(
      /import GoogleMaps\n/,
      match => `${match}import Firebase\n`
    );
  }

  if (!content.includes("FirebaseApp.configure()")) {
    content = content.replace(
      /GMSServices\.provideAPIKey\("<GOOGLE_MAPS_API_KEY>"\)\n\s+/,
      match => `${match}FirebaseApp.configure()\n    `
    );
  }

  await fs.writeFile(appDelegatePath, content, "utf8");
}

async function removeMapsDependencies(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  const content = await fs.readFile(packageJsonPath, "utf8");
  const packageData = JSON.parse(content);

  if (packageData.dependencies) {
    delete packageData.dependencies["react-native-maps"];
    delete packageData.dependencies["react-native-maps-directions"];
  }

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function updatePodfileForMaps(projectPath, enableGoogleMaps) {
  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  let content = await fs.readFile(podfilePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps pod configuration
    // Match the comment and pod declaration, including the rn_maps_path line
    // Replace with newline to ensure proper spacing before post_install
    content = content.replace(
      /\s*# Google Maps для react-native-maps\s*\n\s*rn_maps_path = '\.\.\/node_modules\/react-native-maps'\s*\n\s*pod 'react-native-maps\/Google', :path => rn_maps_path\s*\n?/,
      "\n"
    );
    // Ensure post_install always starts on a new line with proper indentation
    // Normalize any spacing issues: ensure ) is followed by newline, then empty line, then post_install
    content = content.replace(
      /(\s*\))\s*\n?\s*post_install\s+do/,
      "$1\n\n  post_install do"
    );
  }

  await fs.writeFile(podfilePath, content, "utf8");
}

async function updateAppDelegateForMaps(
  projectPath,
  projectName,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const appDelegatePath = path.join(
    projectPath,
    `ios/${projectName}/AppDelegate.swift`
  );
  if (!(await fs.pathExists(appDelegatePath))) return;

  let content = await fs.readFile(appDelegatePath, "utf8");

  if (!enableGoogleMaps) {
    // Remove Google Maps import
    content = content.replace(/import GoogleMaps\n/, "");
    // Remove Google Maps initialization (with comment)
    content = content.replace(
      /\s*\/\/ Initialize Google Maps\s*\n\s*GMSServices\.provideAPIKey\("[^"]*"\)\s*\n\s*/,
      ""
    );
  } else {
    // Ensure Google Maps import exists
    if (!content.includes("import GoogleMaps")) {
      // Add import after other imports
      content = content.replace(
        /(import\s+\w+\n)+/,
        match => `${match}import GoogleMaps\n`
      );
    }
    // Replace API key if provided, otherwise leave placeholder
    if (googleMapsApiKey) {
      content = content.replace(
        /GMSServices\.provideAPIKey\("<GOOGLE_MAPS_API_KEY>"\)/,
        `GMSServices.provideAPIKey("${googleMapsApiKey}")`
      );
    }
    // If no API key, ensure placeholder exists
    if (!content.includes("GMSServices.provideAPIKey")) {
      // Add initialization after didFinishLaunchingWithOptions opening
      content = content.replace(
        /(didFinishLaunchingWithOptions[^:]*:\s*Bool\s*\{)\s*/,
        `$1\n    // Initialize Google Maps\n    GMSServices.provideAPIKey("<GOOGLE_MAPS_API_KEY>")\n    `
      );
    }
  }

  await fs.writeFile(appDelegatePath, content, "utf8");
}

async function updateAndroidManifestForMaps(
  projectPath,
  enableGoogleMaps,
  googleMapsApiKey
) {
  const manifestPath = path.join(
    projectPath,
    "android/app/src/main/AndroidManifest.xml"
  );
  if (!(await fs.pathExists(manifestPath))) return;

  let content = await fs.readFile(manifestPath, "utf8");

  if (!enableGoogleMaps || !googleMapsApiKey) {
    // Ensure the Google Maps API key meta-data is commented out
    // First check if there's an uncommented meta-data tag (any format)
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/>/;

    if (uncommentedPattern.test(content)) {
      // Comment it out
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<!-- <meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="\${GOOGLE_MAPS_API_KEY}" /> -->`
      );
    }
    // If already commented (in any format), leave it as is - no action needed
  } else {
    // Uncomment and set the API key
    const commentedSingleLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/> -->/;
    const commentedMultiLinePattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<!-- <meta-data[\s\S]*?android:name="com\.google\.android\.geo\.API_KEY"[\s\S]*?\/> -->/;
    const uncommentedPattern =
      /(\s*)<!-- Google Maps API Key -->\s*\n(\s*)<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"\s*\/>/;

    if (commentedMultiLinePattern.test(content)) {
      // Uncomment multi-line format and set API key
      content = content.replace(
        commentedMultiLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (commentedSingleLinePattern.test(content)) {
      // Uncomment single-line format and set API key
      content = content.replace(
        commentedSingleLinePattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    } else if (uncommentedPattern.test(content)) {
      // Replace existing API key
      content = content.replace(
        uncommentedPattern,
        `$1<!-- Google Maps API Key -->\n$2<meta-data\n$2    android:name="com.google.android.geo.API_KEY"\n$2    android:value="${googleMapsApiKey}" />`
      );
    }
  }

  await fs.writeFile(manifestPath, content, "utf8");
}

// Generate a 24-character hex ID for Xcode project objects
function generateXcodeId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  )
    .join("")
    .toUpperCase();
}

async function addGoogleServicesToXcodeProject(
  projectPath,
  projectName,
  selectedEnvs = [],
  hasMultipleEnvs = false
) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) return;

  let content = await fs.readFile(pbxprojPath, "utf8");
  const mainGroupId = "83CBB9F61A601CBA00E9B192"; // Standard main group ID
  const projectGroupId =
    content.match(
      new RegExp(
        `${projectName}\\s*=\\s*\\{[^}]*isa = PBXGroup[^}]*children\\s*=\\s*\\(([A-F0-9]{24})`,
        "m"
      )
    )?.[1] ||
    content
      .match(
        new RegExp(
          `13B07FAE1A68108700A75B9A\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/`,
          "m"
        )
      )?.[0]
      ?.match(/[A-F0-9]{24}/)?.[0];

  if (hasMultipleEnvs) {
    // Multiple environments: add GoogleServices folder
    if (content.includes("path = GoogleServices")) {
      return; // Already added
    }

    // Generate IDs
    const googleServicesId = generateXcodeId();

    // Find mainGroup and add GoogleServices to children
    const mainGroupRegex = new RegExp(
      `(${mainGroupId.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*=\\s*\\{[^}]*children\\s*=\\s*\\()`,
      "m"
    );
    if (mainGroupRegex.test(content)) {
      content = content.replace(
        mainGroupRegex,
        `$1${googleServicesId} /* GoogleServices */,\n\t\t\t\t`
      );
    }

    // Find all targets to create exception sets for each
    const allEnvs = [...selectedEnvs];
    if (!allEnvs.some(env => env.toLowerCase() === "production")) {
      allEnvs.push("production");
    }

    // Find all targets (base + environment targets)
    // Look for PBXNativeTarget blocks - they start with ID /* name */ = { and contain isa = PBXNativeTarget;
    const targetMatches = [];
    const nativeTargetSectionMatch = content.match(
      /\/\* Begin PBXNativeTarget section \*\/\s*([\s\S]*?)\/\* End PBXNativeTarget section \*\//m
    );
    if (nativeTargetSectionMatch) {
      const nativeTargetSection = nativeTargetSectionMatch[1];
      // Match: ID /* name */ = { ... isa = PBXNativeTarget; ... name = name;
      const targetBlockRegex =
        /(\w{24})\s*\/\*\s*([^*]+)\s*\*\/\s*=\s*\{[\s\S]*?isa\s*=\s*PBXNativeTarget;[\s\S]*?name\s*=\s*([^;]+);/g;
      let targetMatch;
      while (
        (targetMatch = targetBlockRegex.exec(nativeTargetSection)) !== null
      ) {
        const targetId = targetMatch[1];
        const targetName = targetMatch[3].trim();
        targetMatches.push({ id: targetId, name: targetName });
      }
    }

    // Create exception sets for each target
    const exceptionSetIds = [];
    for (const target of targetMatches) {
      // Determine which environment this target belongs to
      let targetEnv = null;
      const lowerTargetName = target.name.toLowerCase();
      const lowerProjectName = projectName.toLowerCase();

      // Check if it's the base production target
      if (lowerTargetName === lowerProjectName) {
        targetEnv = "production";
      } else {
        // Check environment targets
        for (const env of allEnvs) {
          const envName = getEnvNameForScheme(env);
          if (
            lowerTargetName.includes(env.toLowerCase()) ||
            lowerTargetName.includes(envName.toLowerCase())
          ) {
            targetEnv = env.toLowerCase();
            break;
          }
        }
      }

      if (!targetEnv) continue; // Skip if we can't determine the environment

      // Create exception set ID
      const exceptionSetId = generateXcodeId();
      exceptionSetIds.push(exceptionSetId);

      // Each target excludes its OWN environment file (as in lepimvarim)
      const excludedFile = `"${targetEnv}/GoogleService-Info.plist"`;

      // Add PBXFileSystemSynchronizedBuildFileExceptionSet section if it doesn't exist
      if (
        !content.includes(
          "PBXFileSystemSynchronizedBuildFileExceptionSet section"
        )
      ) {
        const exceptionSetSection = `/* Begin PBXFileSystemSynchronizedBuildFileExceptionSet section */\n\t\t${exceptionSetId} /* PBXFileSystemSynchronizedBuildFileExceptionSet */ = {\n\t\t\tisa = PBXFileSystemSynchronizedBuildFileExceptionSet;\n\t\t\tmembershipExceptions = (\n\t\t\t\t${excludedFile},\n\t\t\t);\n\t\t\ttarget = ${target.id} /* ${target.name} */;\n\t\t};\n/* End PBXFileSystemSynchronizedBuildFileExceptionSet section */\n\n`;

        // Insert before PBXFileSystemSynchronizedRootGroup section
        const rootGroupSectionRegex =
          /\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\//;
        if (rootGroupSectionRegex.test(content)) {
          content = content.replace(
            rootGroupSectionRegex,
            exceptionSetSection +
              "/* Begin PBXFileSystemSynchronizedRootGroup section */"
          );
        } else {
          // Insert before PBXFrameworksBuildPhase section
          const frameworksSectionRegex =
            /\/\* Begin PBXFrameworksBuildPhase section \*\//;
          if (frameworksSectionRegex.test(content)) {
            content = content.replace(
              frameworksSectionRegex,
              exceptionSetSection +
                "/* Begin PBXFrameworksBuildPhase section */"
            );
          }
        }
      } else {
        // Section exists, add our exception set before the end marker
        const exceptionSetBlock = `\t\t${exceptionSetId} /* PBXFileSystemSynchronizedBuildFileExceptionSet */ = {\n\t\t\tisa = PBXFileSystemSynchronizedBuildFileExceptionSet;\n\t\t\tmembershipExceptions = (\n\t\t\t\t${excludedFile},\n\t\t\t);\n\t\t\ttarget = ${target.id} /* ${target.name} */;\n\t\t};\n`;
        content = content.replace(
          /(\/\* End PBXFileSystemSynchronizedBuildFileExceptionSet section \*\/)/,
          `${exceptionSetBlock}$1`
        );
      }
    }

    // Add PBXFileSystemSynchronizedRootGroup section if it doesn't exist
    const exceptionsList = exceptionSetIds
      .map(id => `${id} /* PBXFileSystemSynchronizedBuildFileExceptionSet */`)
      .join(", ");
    if (!content.includes("PBXFileSystemSynchronizedRootGroup section")) {
      const synchronizedRootGroupSection = `/* Begin PBXFileSystemSynchronizedRootGroup section */\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (${exceptionsList}); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };\n/* End PBXFileSystemSynchronizedRootGroup section */\n\n`;

      // Insert before PBXFrameworksBuildPhase section
      const frameworksSectionRegex =
        /\/\* Begin PBXFrameworksBuildPhase section \*\//;
      if (frameworksSectionRegex.test(content)) {
        content = content.replace(
          frameworksSectionRegex,
          synchronizedRootGroupSection +
            "/* Begin PBXFrameworksBuildPhase section */"
        );
      }
    } else {
      // Section exists, update exceptions list
      const rootGroupRegex = new RegExp(
        `(${googleServicesId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\/\\*\\s*GoogleServices\\s*\\*\\/\\s*=\\s*\\{[^}]*exceptions\\s*=\\s*\\()([^)]*)(\\)[^}]*\\};)`,
        "m"
      );
      if (rootGroupRegex.test(content)) {
        // Get existing exception IDs
        const existingExceptions = rootGroupRegex.exec(content);
        const existingExceptionIds =
          existingExceptions[2].match(/\w{24}/g) || [];

        // Combine existing and new exception IDs, avoiding duplicates
        const allExceptionIds = [
          ...new Set([...existingExceptionIds, ...exceptionSetIds]),
        ];
        const allExceptionsList = allExceptionIds
          .map(
            id => `${id} /* PBXFileSystemSynchronizedBuildFileExceptionSet */`
          )
          .join(", ");

        content = content.replace(rootGroupRegex, `$1${allExceptionsList}$3`);
      } else {
        // Root group doesn't exist yet, add it
        const existingSectionRegex =
          /(\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\/)/;
        content = content.replace(
          existingSectionRegex,
          `$1\n\t\t${googleServicesId} /* GoogleServices */ = {isa = PBXFileSystemSynchronizedRootGroup; exceptions = (${exceptionsList}); explicitFileTypes = {}; explicitFolders = (); path = GoogleServices; sourceTree = "<group>"; };`
        );
      }
    }

    // Note: In lepimvarim, GoogleServices is added to mainGroup but NOT to fileSystemSynchronizedGroups in targets
    // PBXFileSystemSynchronizedRootGroup with exceptions is sufficient - Xcode automatically handles file visibility
    // We don't need to add fileSystemSynchronizedGroups to each target
  } else {
    // Single environment: add GoogleService-Info.plist file directly to project group
    // Check if file already exists (by name, not by reference)
    const fileExistsRegex = new RegExp(
      `GoogleService-Info\\.plist.*path = "${projectName}/GoogleService-Info\\.plist"`,
      "m"
    );
    if (fileExistsRegex.test(content)) {
      return; // Already added
    }

    const fileId = generateXcodeId();
    const buildFileId = generateXcodeId();

    // Find project group by looking for the group that contains the project name
    // The group ID is typically 13B07FAE1A68108700A75B9A but name is replaced
    const projectGroupMatch = content.match(
      new RegExp(
        `([A-F0-9]{24})\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/\\s*=\\s*\\{[^}]*isa = PBXGroup[^}]*children\\s*=\\s*\\(`,
        "m"
      )
    );

    if (projectGroupMatch) {
      const projectGroupId = projectGroupMatch[1];
      const projectGroupRegex = new RegExp(
        `(${projectGroupId}\\s*/\\*\\s*${projectName.toLowerCase()}\\s*\\*/\\s*=\\s*\\{[^}]*children\\s*=\\s*\\()`,
        "m"
      );
      if (projectGroupRegex.test(content)) {
        content = content.replace(
          projectGroupRegex,
          `$1${fileId} /* GoogleService-Info.plist */,\n\t\t\t\t`
        );
      }
    }

    // Add PBXFileReference
    const fileReferenceSectionRegex =
      /(\/\* Begin PBXFileReference section \*\/)/;
    if (fileReferenceSectionRegex.test(content)) {
      content = content.replace(
        fileReferenceSectionRegex,
        `$1\n\t\t${fileId} /* GoogleService-Info.plist */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; name = "GoogleService-Info.plist"; path = "${projectName}/GoogleService-Info.plist"; sourceTree = "<group>"; };`
      );
    }

    // Add PBXBuildFile
    const buildFileSectionRegex = /(\/\* Begin PBXBuildFile section \*\/)/;
    if (buildFileSectionRegex.test(content)) {
      content = content.replace(
        buildFileSectionRegex,
        `$1\n\t\t${buildFileId} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${fileId} /* GoogleService-Info.plist */; };`
      );
    }

    // Add to Resources build phase - find by target name pattern
    const resourcesPhaseRegex = new RegExp(
      `(13B07F8E1A680F5B00A75B9A\\s*/\\*\\s*Resources\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?files\\s*=\\s*\\([\\s\\S]*?)(\\t\\t\\t\\);\\s*runOnlyForDeploymentPostprocessing)`,
      "m"
    );
    if (resourcesPhaseRegex.test(content)) {
      content = content.replace(
        resourcesPhaseRegex,
        `$1\t\t\t\t${buildFileId} /* GoogleService-Info.plist in Resources */,\n\t\t\t$2`
      );
    }
  }

  // NOTE: In the reference project, there were NO fixes to buildConfigurationList in PBXNativeTarget blocks
  // The fix was only in XCBuildConfiguration comments (renamed from "lepimvarimStg Debug" to "Debug")
  // and in XCConfigurationList comments (renamed from "lepimvarimStg Debug" to "Debug")
  // So we don't need to fix buildConfigurationList here - it should already be correct from createIosTargetsForEnvs

  // CRITICAL: Verify that staging config list IDs are still correct after Google Services changes
  if (hasMultipleEnvs && selectedEnvs.length > 0) {
    for (const env of selectedEnvs) {
      if (env.toLowerCase() === "production") continue;
      const envSuffix = env.toLowerCase();
      const targetName = `${projectName}${
        envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
      }`;

      // Find staging target and its config list
      const stagingTargetMatch = content.match(
        new RegExp(
          `(\\w{24})\\s*/\\*\\s*${targetName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\s*\\*/[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})`,
          "m"
        )
      );
      if (stagingTargetMatch) {
        const stagingConfigListId = stagingTargetMatch[2];
        // Find config IDs in this config list
        const stagingConfigListBlock = content.match(
          new RegExp(
            `${stagingConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
            "m"
          )
        );
        if (stagingConfigListBlock) {
          const configIdsInList =
            stagingConfigListBlock[1].match(/\w{24}/g) || [];
          // Check if these are base config IDs (should be different!)
          const baseConfigListMatch = content.match(
            new RegExp(
              `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${projectName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
              "m"
            )
          );
          if (baseConfigListMatch) {
            const baseConfigIds = baseConfigListMatch[2].match(/\w{24}/g) || [];
            const overlap = configIdsInList.filter(id =>
              baseConfigIds.includes(id)
            );
            if (overlap.length > 0) {
              console.log(
                chalk.red(
                  `❌ AFTER GOOGLE SERVICES: ${targetName} config list uses SAME config IDs as base! Config IDs: ${configIdsInList.join(
                    ", "
                  )}, Base: ${baseConfigIds.join(
                    ", "
                  )}, Overlap: ${overlap.join(", ")}`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ AFTER GOOGLE SERVICES: ${targetName} config list correctly uses different config IDs: ${configIdsInList.join(
                    ", "
                  )}`
                )
              );
            }
          }
        }
      }
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
  if (hasMultipleEnvs) {
    console.log(
      chalk.green(`  ✅ Added GoogleServices folder to Xcode project`)
    );
  } else {
    console.log(
      chalk.green(`  ✅ Added GoogleService-Info.plist to Xcode project`)
    );
  }
}

async function copyAndroidEnvSources(
  selectedEnvs,
  projectPath,
  bundleIdentifier,
  displayName
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const mainSrcPath = path.join(projectPath, "android/app/src/main");
  if (!(await fs.pathExists(mainSrcPath))) {
    console.log(
      chalk.yellow(`⚠️  Main source path does not exist: ${mainSrcPath}`)
    );
    return;
  }

  // Helper function to get environment display name
  const getEnvDisplayName = (env, baseDisplayName) => {
    const envNameMap = {
      staging: "Staging",
      development: "Dev",
      local: "Local",
    };
    const envSuffix = envNameMap[env.toLowerCase()] || capitalize(env);
    return `${baseDisplayName} ${envSuffix}`;
  };

  for (const env of selectedEnvs) {
    // Skip production - it doesn't need a source directory, only flavor in build.gradle
    if (env.toLowerCase() === "production") {
      continue;
    }

    const envDir = path.join(projectPath, `android/app/src/${env}`);
    await fs.ensureDir(envDir);

    // Copy all files except .kt files
    // Walk through the directory and copy files individually
    const copyRecursive = async (src, dest) => {
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        await fs.ensureDir(dest);
        const entries = await fs.readdir(src);
        for (const entry of entries) {
          // Skip java directory (contains .kt files)
          if (entry === "java") {
            continue;
          }
          await copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
      } else {
        // Skip .kt files
        if (!src.endsWith(".kt")) {
          await fs.copy(src, dest, { overwrite: true });
        }
      }
    };

    await copyRecursive(mainSrcPath, envDir);

    // Update app_name in strings.xml for this environment
    const envStringsXmlPath = path.join(envDir, "res/values/strings.xml");
    if (await fs.pathExists(envStringsXmlPath)) {
      let stringsContent = await fs.readFile(envStringsXmlPath, "utf8");
      const envDisplayName = getEnvDisplayName(env, displayName);
      const regex = /<string name="app_name">[^<]*<\/string>/m;
      const replacement = `<string name="app_name">${envDisplayName}</string>`;
      if (regex.test(stringsContent)) {
        stringsContent = stringsContent.replace(regex, replacement);
      } else {
        stringsContent = stringsContent.replace(
          /<\/resources>\s*$/m,
          `    ${replacement}\n</resources>`
        );
      }
      await fs.writeFile(envStringsXmlPath, stringsContent, "utf8");
    }

    // Also copy fonts from main/assets/fonts to env/assets/fonts if they exist
    const mainFontsDir = path.join(mainSrcPath, "assets", "fonts");
    const envFontsDir = path.join(envDir, "assets", "fonts");
    if (await fs.pathExists(mainFontsDir)) {
      await fs.ensureDir(envFontsDir);
      const fontFiles = await fs.readdir(mainFontsDir);
      for (const fontFile of fontFiles) {
        const sourceFont = path.join(mainFontsDir, fontFile);
        const targetFont = path.join(envFontsDir, fontFile);
        const stat = await fs.stat(sourceFont);
        if (stat.isFile()) {
          await fs.copy(sourceFont, targetFont, { overwrite: true });
        }
      }
    }

    // Note: We don't add package attribute to AndroidManifest.xml as it causes errors
  }
}

function buildEnvConfigFilesBlock(selectedEnvs) {
  // Always include production for Android (even if not selected)
  const envsForConfig = [...selectedEnvs];
  if (!envsForConfig.some(env => env.toLowerCase() === "production")) {
    envsForConfig.push("production");
  }

  const allLines = [];
  envsForConfig.forEach((env, index) => {
    const lower = env.toLowerCase();
    const isLast = index === envsForConfig.length - 1;
    allLines.push(`    ${lower}debug: ".env.${lower}",`);
    // Last release line should not have comma
    if (isLast) {
      allLines.push(`    ${lower}release: ".env.${lower}"`);
    } else {
      allLines.push(`    ${lower}release: ".env.${lower}",`);
    }
  });
  return `project.ext.envConfigFiles = [\n${allLines.join("\n")}\n]`;
}

function buildProductFlavorsBlock(selectedEnvs, bundleIdentifier) {
  // Always include production for Android (even if not selected)
  const envsForFlavors = [...selectedEnvs];
  if (!envsForFlavors.some(env => env.toLowerCase() === "production")) {
    envsForFlavors.push("production");
  }

  const flavors = envsForFlavors
    .map(env => {
      const lower = env.toLowerCase();
      // Each environment needs a unique applicationId to be a separate app
      // Production uses base bundleIdentifier, others get a suffix
      let applicationId = bundleIdentifier;
      if (lower !== "production") {
        // Use suffix: staging -> .staging, development -> .dev, local -> .local
        const suffixMap = {
          staging: "staging",
          development: "dev",
          local: "local",
        };
        const suffix = suffixMap[lower] || lower;
        applicationId = `${bundleIdentifier}.${suffix}`;
      }
      return `        ${lower} {\n            minSdkVersion rootProject.ext.minSdkVersion\n            applicationId "${applicationId}"\n            targetSdkVersion rootProject.ext.targetSdkVersion\n            resValue "string", "build_config_package", "${bundleIdentifier}"\n        }`;
    })
    .join("\n");

  return `    flavorDimensions "default"\n    productFlavors {\n${flavors}\n    }`;
}

async function updateAndroidBuildGradle(
  selectedEnvs,
  projectPath,
  bundleIdentifier
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const buildGradlePath = path.join(projectPath, "android/app/build.gradle");
  if (!(await fs.pathExists(buildGradlePath))) {
    console.log(
      chalk.yellow(`⚠️  build.gradle does not exist: ${buildGradlePath}`)
    );
    return;
  }

  let content = await fs.readFile(buildGradlePath, "utf8");

  // Add or update envConfigFiles block
  const envBlock = buildEnvConfigFilesBlock(selectedEnvs);
  // Match the entire envConfigFiles block including newlines
  const envRegex = /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/m;
  if (envRegex.test(content)) {
    // Update existing block - replace the entire block
    content = content.replace(envRegex, envBlock);
  } else {
    // Add new block - try to find apply from dotenv.gradle first
    const dotenvRegex =
      /(apply from: project\(':react-native-config'\)\.projectDir\.getPath\(\) \+ "\/dotenv\.gradle")/;
    if (dotenvRegex.test(content)) {
      // Add after the dotenv.gradle line with proper newline
      content = content.replace(dotenvRegex, `$1\n${envBlock}`);
    } else {
      // Try to find any apply from dotenv
      const dotenvSimpleRegex = /(apply from: .*dotenv\.gradle)/;
      if (dotenvSimpleRegex.test(content)) {
        content = content.replace(dotenvSimpleRegex, `$1\n${envBlock}`);
      } else {
        // Add at the top of the file after any apply statements
        const applyRegex = /(apply plugin:.*\n)/;
        if (applyRegex.test(content)) {
          content = content.replace(applyRegex, `$1${envBlock}\n`);
        } else {
          // Add at the beginning
          content = `${envBlock}\n${content}`;
        }
      }
    }
  }

  // Add or update productFlavors block
  const flavorsBlock = buildProductFlavorsBlock(selectedEnvs, bundleIdentifier);
  const productFlavorsRegex =
    /flavorDimensions[\s\S]*?productFlavors\s*\{[\s\S]*?\}/m;
  if (productFlavorsRegex.test(content)) {
    // Update existing block
    content = content.replace(productFlavorsRegex, flavorsBlock);
  } else {
    // Add new block - find android block and add after defaultConfig
    const androidBlockRegex =
      /(android\s*\{[\s\S]*?defaultConfig\s*\{[\s\S]*?\}\s*)/m;
    if (androidBlockRegex.test(content)) {
      content = content.replace(
        androidBlockRegex,
        match => `${match}\n    ${flavorsBlock}\n`
      );
    } else {
      // Try to find android block without defaultConfig
      const androidSimpleRegex = /(android\s*\{)/m;
      if (androidSimpleRegex.test(content)) {
        content = content.replace(
          androidSimpleRegex,
          match => `${match}\n    ${flavorsBlock}\n`
        );
      } else {
        console.log(
          chalk.yellow(`⚠️  Could not find android block in build.gradle`)
        );
      }
    }
  }

  // Add matchingFallbacks to buildTypes (required for productFlavors)
  // This ensures that debug/release build types can work with all flavors
  const buildTypesRegex =
    /(buildTypes\s*\{[\s\S]*?debug\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug)/m;
  if (buildTypesRegex.test(content) && !content.includes("matchingFallbacks")) {
    content = content.replace(
      buildTypesRegex,
      `$1\n            matchingFallbacks = ['debug', 'release']`
    );
  }

  // Validate that envConfigFiles block is properly formatted
  const validationRegex = /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/m;
  const match = content.match(validationRegex);
  if (match) {
    const block = match[0];
    // Check for common issues
    if (block.includes(']"') || block.match(/\]\s*"/)) {
      console.log(
        chalk.yellow(
          "⚠️  Warning: Found potential quote issue in envConfigFiles block"
        )
      );
    }
    // Ensure block ends with ] and not ]"
    if (block.trim().endsWith(']"')) {
      content = content.replace(block, block.replace(/\]\s*"$/, "]"));
    }
  }

  await fs.writeFile(buildGradlePath, content, "utf8");
}

function buildPreActionBlock(buildableReference, env, projectName) {
  const escapedEnv = env.toLowerCase();
  const projectDirVar = "${PROJECT_DIR}";
  return `  <PreActions>
      <ExecutionAction
         ActionType = "Xcode.IDEStandardExecutionActionsCore.ExecutionActionType.ShellScriptAction">
         <ActionContent
            title = "Run Script"
            scriptText = "cp &quot;${projectDirVar}/../.env.${escapedEnv}&quot; &quot;${projectDirVar}/../.env&quot;&#10;">
            <EnvironmentBuildable>
${buildableReference}
            </EnvironmentBuildable>
         </ActionContent>
      </ExecutionAction>
   </PreActions>
`;
}

function injectPreActionIntoSection(schemeContent, tag, preAction) {
  // Remove existing PreActions within the section
  const sectionRegex = new RegExp(
    `<${tag}[^>]*>[\\s\\S]*?<\\/` + tag + `>`,
    "m"
  );
  const match = schemeContent.match(sectionRegex);
  if (!match) return schemeContent;

  let section = match[0];
  section = section.replace(/<PreActions>[\s\S]*?<\/PreActions>/g, "");
  // Insert preAction right after the opening tag
  section = section.replace(new RegExp(`(<${tag}[^>]*>)`), `$1\n${preAction}`);

  return schemeContent.replace(sectionRegex, section);
}

async function renameDefaultIosScheme(projectPath, projectName) {
  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  // Find HelloWorld scheme or any scheme that needs renaming
  const helloWorldScheme = schemeFiles.find(
    file =>
      file.includes("HelloWorld") || file.toLowerCase().includes("helloworld")
  );

  if (!helloWorldScheme) {
    // Check if there's a scheme that doesn't match projectName
    const baseScheme = schemeFiles[0];
    if (baseScheme && !baseScheme.includes(projectName)) {
      // Rename it to projectName
      const oldPath = path.join(schemesDir, baseScheme);
      const newPath = path.join(schemesDir, `${projectName}.xcscheme`);
      if (oldPath !== newPath) {
        await fs.move(oldPath, newPath, { overwrite: true });

        // Update scheme content
        let schemeContent = await fs.readFile(newPath, "utf8");
        schemeContent = schemeContent
          .replace(/HelloWorld/g, projectName)
          .replace(/helloworld/g, projectName.toLowerCase());
        await fs.writeFile(newPath, schemeContent, "utf8");
        console.log(
          chalk.green(`  ✅ Renamed scheme to ${projectName}.xcscheme`)
        );
      }
    }
    return;
  }

  const oldPath = path.join(schemesDir, helloWorldScheme);
  const newPath = path.join(schemesDir, `${projectName}.xcscheme`);

  if (oldPath !== newPath) {
    await fs.move(oldPath, newPath, { overwrite: true });

    // Update scheme content
    let schemeContent = await fs.readFile(newPath, "utf8");
    schemeContent = schemeContent
      .replace(/HelloWorld/g, projectName)
      .replace(/helloworld/g, projectName.toLowerCase());
    await fs.writeFile(newPath, schemeContent, "utf8");
    console.log(
      chalk.green(
        `  ✅ Renamed scheme from ${helloWorldScheme} to ${projectName}.xcscheme`
      )
    );
  }
}

async function createIosEnvSchemes(
  selectedEnvs,
  projectPath,
  projectName,
  buildableRefs = {},
  googleFilesByEnv = {}
) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const envsForSchemes = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );

  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  const workspaceSchemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcworkspace/xcshareddata`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  const baseSchemePath = path.join(schemesDir, schemeFiles[0]);
  let baseSchemeContent = await fs.readFile(baseSchemePath, "utf8");
  baseSchemeContent = baseSchemeContent
    .replace(/HelloWorld/g, projectName)
    .replace(/helloworld/g, projectName.toLowerCase());
  const buildableMatch = baseSchemeContent.match(
    /<BuildableReference[\s\S]*?<\/BuildableReference>/
  );
  const baseBuildableReference =
    buildableRefs.base?.ref || (buildableMatch ? buildableMatch[0] : null);

  // Ensure base scheme name matches project
  const desiredBaseScheme = `${projectName}.xcscheme`;
  if (path.basename(baseSchemePath) !== desiredBaseScheme) {
    await fs.move(baseSchemePath, path.join(schemesDir, desiredBaseScheme), {
      overwrite: true,
    });
  }

  if (!baseBuildableReference) return;

  // Create Info.plist copies for each env scheme (excluding production)
  // Info.plist files are created in ios/ directory, not in projectName subdirectory
  const baseInfoPlist = path.join(projectPath, `ios/${projectName}/Info.plist`);

  // First, ensure base Info.plist has fonts (used by production)
  // Get font files from assets/fonts and update base Info.plist BEFORE copying
  const fontsDir = path.join(projectPath, "assets", "fonts");
  let fontFiles = [];
  if (await fs.pathExists(fontsDir)) {
    fontFiles = (await fs.readdir(fontsDir)).filter(file =>
      /\.(ttf|otf|ttc|woff|woff2)$/i.test(file)
    );
    if (fontFiles.length > 0 && (await fs.pathExists(baseInfoPlist))) {
      // Update base Info.plist (production uses this) before copying
      await addFontsToInfoPlistForPath(baseInfoPlist, fontFiles);
    }
  }

  // Now copy the updated base Info.plist for each environment
  const envInfoPlists = [];
  for (const env of envsForSchemes) {
    const envPlistFileName = `${projectName} ${env}-Info.plist`;
    const envPlistPath = path.join(
      projectPath,
      `ios/${projectName}/${envPlistFileName}`
    );
    if (await fs.pathExists(baseInfoPlist)) {
      await fs.copy(baseInfoPlist, envPlistPath, { overwrite: true });
      envInfoPlists.push({
        env,
        path: envPlistPath,
        fileName: envPlistFileName,
      });
    }
  }

  // Update all environment Info.plist files with fonts (they should already have them from copy, but ensure)
  if (fontFiles.length > 0) {
    for (const { path: envPlistPath } of envInfoPlists) {
      await addFontsToInfoPlistForPath(envPlistPath, fontFiles);
    }
  }

  // Add Info.plist files to Xcode project
  await addInfoPlistsToXcodeProject(
    projectPath,
    projectName,
    envInfoPlists,
    pbxprojPath
  );

  // Always add pre-actions to production/base scheme (.env.production)
  console.log(chalk.blue(`  Updating production scheme: ${desiredBaseScheme}`));
  const prodPreAction = buildPreActionBlock(
    baseBuildableReference,
    "production",
    projectName
  );
  let prodSchemeContent = baseSchemeContent.replace(
    /<Scheme[^>]*>/,
    `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "BuildAction",
    prodPreAction
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "LaunchAction",
    prodPreAction
  );
  await fs.writeFile(
    path.join(schemesDir, desiredBaseScheme),
    prodSchemeContent,
    "utf8"
  );
  console.log(chalk.green(`  ✅ Production scheme updated`));

  for (const env of envsForSchemes) {
    const schemeName = `${projectName}${getEnvNameForScheme(env)}`;
    console.log(
      chalk.blue(`  Creating scheme for ${env}: ${schemeName}.xcscheme`)
    );
    const envBuildableRef =
      buildableRefs.envs?.[env]?.ref || baseBuildableReference;

    if (!buildableRefs.envs?.[env]?.ref) {
      console.log(
        chalk.yellow(
          `⚠️  Warning: No buildableRef for ${env}, using baseBuildableReference`
        )
      );
    }

    const targetPath = path.join(schemesDir, `${schemeName}.xcscheme`);
    let schemeContent = baseSchemeContent.replace(
      /<Scheme[^>]*>/,
      `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
    );

    // CRITICAL: Replace ALL BuildableReference in scheme with environment-specific one
    // This ensures the scheme uses the correct executable (lepimvarimStaging.app instead of lepimvarim.app)
    if (buildableRefs.envs?.[env]?.ref) {
      // Replace all BuildableReference blocks with the environment-specific one
      // Match BuildableReference with any whitespace/newlines
      const buildableRefRegex =
        /<BuildableReference[\s\S]*?<\/BuildableReference>/g;
      const matches = schemeContent.match(buildableRefRegex);
      if (matches && matches.length > 0) {
        schemeContent = schemeContent.replace(
          buildableRefRegex,
          envBuildableRef
        );
      } else {
        console.log(
          chalk.yellow(`⚠️  No BuildableReference found in scheme to replace`)
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  No buildableRef for ${env}, scheme will use baseBuildableReference (${
            baseBuildableReference?.match(/BuildableName = "([^"]+)"/)?.[1] ||
            "unknown"
          })`
        )
      );
    }

    // Inject pre-actions into BuildAction (replace existing PreActions)
    const preAction = buildPreActionBlock(envBuildableRef, env, projectName);
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "BuildAction",
      preAction
    );
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "LaunchAction",
      preAction
    );

    await fs.writeFile(targetPath, schemeContent, "utf8");
    console.log(chalk.green(`  ✅ Scheme ${schemeName}.xcscheme created`));

    if (workspaceSchemesDir) {
      await fs.ensureDir(workspaceSchemesDir);
    }
  }

  console.log(
    chalk.green(
      `✅ Created ${envsForSchemes.length} environment scheme(s) + production scheme`
    )
  );
}

async function updatePodfileForEnvs(selectedEnvs, projectPath, projectName) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  const envsForTargets = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );
  const targets = envsForTargets.map(
    env => `${projectName}${getEnvNameForScheme(env)}`
  );

  // Add prod target when multiple environments are created
  const prodTargetBlock = `  target '${projectName}' do
  end
`;

  const targetBlocks =
    targets
      .map(
        target => `  target '${target}' do
  end
`
      )
      .join("\n") + prodTargetBlock;

  const podfileContent = `def node_require(script)
  # Resolve script with node to allow for hoisting
  require Pod::Executable.execute_command('node', ['-p',
    "require.resolve(
     '\#{script}',
     {paths: [process.argv[1]]},
    )", __dir__]).strip
end

# Use it to require both react-native's and this package's scripts:
node_require('react-native/scripts/react_native_pods.rb')
node_require('react-native-permissions/scripts/setup.rb')

platform :ios, 15.6
prepare_react_native_project!

setup_permissions([
  'Camera',
  'LocationAccuracy',
  'LocationAlways',
  'LocationWhenInUse',
  'MediaLibrary',
  'PhotoLibrary',
  'PhotoLibraryAddOnly'
])

linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with \#{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
end

abstract_target '${projectName}CommonPods' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "\#{Pod::Config.instance.installation_root}/.."
  )

  pod 'FirebaseCore', :modular_headers => true
  pod 'GoogleUtilities', :modular_headers => true
  
  # Google Maps для react-native-maps
  rn_maps_path = '../node_modules/react-native-maps'
  pod 'react-native-maps/Google', :path => rn_maps_path
  
  pod 'FirebaseRemoteConfig', :modular_headers => true
  pod 'FirebaseABTesting', :modular_headers => true
  pod 'FirebaseInstallations', :modular_headers => true

${targetBlocks}
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )
  end
end
`;

  await fs.writeFile(podfilePath, podfileContent, "utf8");
}

function genId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase()
  ).join("");
}

function cloneBuildConfigBlock(baseBlock, newId, newName, envPlistName) {
  // Extract the original ID from the block
  const originalIdMatch = baseBlock.match(/^(\s*)(\w{24})\s\/\*.*?\*\//);
  if (!originalIdMatch) return baseBlock;

  const originalIndent = originalIdMatch[1];
  const originalId = originalIdMatch[2];

  // Replace ID in the first line, preserving original indentation
  let block = baseBlock.replace(
    new RegExp(`^\\s*${originalId}\\s/\\*.*?\\*/`),
    `${originalIndent}${newId} /* ${newName} */`
  );

  // Replace name and INFOPLIST_FILE
  // If newName contains spaces, it must be quoted in project.pbxproj
  const nameValue = newName.includes(" ") ? `"${newName}"` : newName;
  // Replace name field (outside buildSettings, at the end of the block)
  // Match: name = <value>; where value can be quoted or unquoted
  block = block.replace(/name = ("[^"]*"|[^;]+);/, `name = ${nameValue};`);
  // Replace INFOPLIST_FILE inside buildSettings
  // Extract project folder name from base block (format: projectName/Info.plist)
  const baseInfoplistMatch = baseBlock.match(/INFOPLIST_FILE = ([^;]+);/);
  let infoplistPath = envPlistName;
  if (baseInfoplistMatch) {
    const basePath = baseInfoplistMatch[1].trim().replace(/^"|"$/g, "");
    const projectFolder = basePath.split("/")[0];
    // Format: projectFolder/projectName env-Info.plist
    infoplistPath = `${projectFolder}/${envPlistName}`;
  }
  // Always quote the path (may contain spaces)
  const quotedPath = `"${infoplistPath}"`;
  block = block.replace(
    /INFOPLIST_FILE = [^;]+;/,
    `INFOPLIST_FILE = ${quotedPath};`
  );

  return block;
}

async function createIosTargetsForEnvs(
  selectedEnvs,
  projectPath,
  projectName,
  baseBundleIdentifier,
  displayName
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return null;

  const envs = selectedEnvs.filter(env => env.toLowerCase() !== "production");
  if (envs.length === 0) return null;

  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) return null;

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Locate base application target (first application PBXNativeTarget)
  // First find the PBXNativeTarget section
  const nativeTargetSectionMatch = content.match(
    /\/\* Begin PBXNativeTarget section \*\/\s*([\s\S]*?)\/\* End PBXNativeTarget section \*\//m
  );
  if (!nativeTargetSectionMatch) {
    console.log(chalk.yellow("⚠️  Could not find PBXNativeTarget section"));
    return null;
  }

  const nativeTargetSection = nativeTargetSectionMatch[1];

  // Find any PBXNativeTarget with application product type in that section
  const targetBlockRegex =
    /(\w{24}) \/\* .*? \*\/ = \{[\s\S]*?isa = PBXNativeTarget;[\s\S]*?productType = "com\.apple\.product-type\.application";[\s\S]*?\};/m;
  const targetBlockMatch = nativeTargetSection.match(targetBlockRegex);
  if (!targetBlockMatch) {
    console.log(
      chalk.yellow(
        "⚠️  Could not find base application target in PBXNativeTarget section"
      )
    );
    return null;
  }
  const targetBlock = targetBlockMatch[0];
  const baseTargetId = targetBlockMatch[1];

  // Extract IDs from the target block
  const configListMatch = targetBlock.match(
    /buildConfigurationList = (\w{24}) \/\* Build configuration list for PBXNativeTarget ".*?" \*\//
  );
  const productRefMatch = targetBlock.match(
    /productReference = (\w{24}) \/\* .*?\.app \*\//
  );

  if (!configListMatch || !productRefMatch) {
    console.log(
      chalk.yellow("⚠️  Could not extract IDs from base target block")
    );
    return null;
  }

  const baseConfigListId = configListMatch[1];
  const baseProductRefId = productRefMatch[1];

  // Base names
  const baseNameMatch = targetBlock.match(/name = ([^;]+);/);
  const baseName = baseNameMatch ? baseNameMatch[1].trim() : projectName;
  const baseProductNameMatch = targetBlock.match(
    /productReference = \w{24} \/\* (.*?)\.app \*\//
  );
  const baseProductName = baseProductNameMatch
    ? baseProductNameMatch[1]
    : baseName;

  // Sections
  const section = re => content.match(re)?.[0] || "";
  const fileRefSectionRe =
    /\/\* Begin PBXFileReference section \*\/[\s\S]*?\/\* End PBXFileReference section \*\//m;
  const nativeSectionRe =
    /\/\* Begin PBXNativeTarget section \*\/[\s\S]*?\/\* End PBXNativeTarget section \*\//m;
  const configListSectionRe =
    /\/\* Begin XCConfigurationList section \*\/[\s\S]*?\/\* End XCConfigurationList section \*\//m;
  const configSectionRe =
    /\/\* Begin XCBuildConfiguration section \*\/[\s\S]*?\/\* End XCBuildConfiguration section \*\//m;

  let fileRefSection = section(fileRefSectionRe);
  let nativeSection = section(nativeSectionRe);
  let configListSection = section(configListSectionRe);
  let configSection = section(configSectionRe);

  if (
    !fileRefSection ||
    !nativeSection ||
    !configListSection ||
    !configSection
  ) {
    console.log(
      chalk.yellow("⚠️  Could not find required sections in project.pbxproj")
    );
    return null;
  }

  const productsGroupRegex =
    /\/\* Products \*\/ = {\s*isa = PBXGroup;\s*children = \(\s*([\s\S]*?)\);\s*name = Products;/m;
  const productsMatch = content.match(productsGroupRegex);
  let productsChildren = productsMatch ? productsMatch[1] : "";

  const projectTargetsRegex =
    /targets = \(\s*([\s\S]*?)\);\s*\};\s*\/\* End PBXProject section \*\//m;
  const projectTargetsMatch = content.match(projectTargetsRegex);
  let projectTargets = projectTargetsMatch ? projectTargetsMatch[1] : "";

  // Find TargetAttributes section to add new targets
  const targetAttributesRegex = /TargetAttributes = \{([\s\S]*?)\};/m;
  const targetAttributesMatch = content.match(targetAttributesRegex);
  let targetAttributes = targetAttributesMatch ? targetAttributesMatch[1] : "";

  // Base product ref block
  const productRefRegex = new RegExp(
    `${baseProductRefId} /\\* .*?\\.app \\*/ = \\{[\\s\\S]*?\\};`,
    "m"
  );
  const productRefBlockMatch = content.match(productRefRegex);
  if (!productRefBlockMatch) {
    console.log(
      chalk.yellow(`⚠️  Could not find product reference ${baseProductRefId}`)
    );
    return null;
  }

  // Config list block and config blocks
  const configListRegex = new RegExp(
    `${baseConfigListId} /\\* Build configuration list for PBXNativeTarget ".*?" \\*/ = {[\\s\\S]*?buildConfigurations = \\(([^)]*?)\\);[\\s\\S]*?};`,
    "m"
  );
  const configListBlockMatch = content.match(configListRegex);
  if (!configListBlockMatch) {
    console.log(
      chalk.yellow(`⚠️  Could not find config list ${baseConfigListId}`)
    );
    return null;
  }
  const configIdsRaw = configListBlockMatch[1]
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // Extract only IDs (24 hex chars) from strings like "13B07F941A680F5B00A75B9A /* Debug */"
  const configIds = configIdsRaw
    .map(s => {
      const idMatch = s.match(/(\w{24})/);
      return idMatch ? idMatch[1] : null;
    })
    .filter(Boolean);

  if (configIds.length === 0) {
    console.log(chalk.yellow("⚠️  No config IDs found"));
    return null;
  }
  // Find config blocks in XCBuildConfiguration section
  const configSectionMatch = content.match(
    /\/\* Begin XCBuildConfiguration section \*\/\s*([\s\S]*?)\/\* End XCBuildConfiguration section \*\//m
  );
  if (!configSectionMatch) {
    console.log(
      chalk.yellow("⚠️  Could not find XCBuildConfiguration section")
    );
    return null;
  }

  const configSectionContent = configSectionMatch[1];
  const configBlocks = {};
  for (const id of configIds) {
    // Search within config section for better accuracy
    // Need to match the entire block including nested braces in buildSettings
    // Match from ID to the closing "};" - need to balance braces
    const idPattern = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blockStart = new RegExp(`${idPattern} /\\* .*? \\*/ = \\{`, "m");
    const startMatch = configSectionContent.match(blockStart);
    if (startMatch) {
      const startPos = startMatch.index;
      let braceCount = 1; // Start at 1 because we're already inside the opening brace
      let pos = startMatch[0].length + startPos;
      let foundEnd = false;

      // Find the matching closing brace
      while (pos < configSectionContent.length && !foundEnd) {
        const char = configSectionContent[pos];
        if (char === "{") braceCount++;
        if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            // Found the closing brace for our block
            // Check if next character is semicolon
            if (
              pos + 1 < configSectionContent.length &&
              configSectionContent[pos + 1] === ";"
            ) {
              const block = configSectionContent.substring(startPos, pos + 2); // +2 for "};"
              // Check if block contains invalid "Swift" field (without VERSION)
              configBlocks[id] = block;
              foundEnd = true;
            }
          }
        }
        pos++;
      }

      if (!foundEnd) {
        console.log(
          chalk.yellow(
            `⚠️  Could not find end of config block ${id} using brace matching, trying regex fallback...`
          )
        );
        // Fallback: try to find block using a more greedy approach
        // Match from ID to the last "};" before the next block or end of section
        const blockStartPos = configSectionContent.indexOf(id);
        if (blockStartPos !== -1) {
          // Find the next block start or end of section
          const nextBlockMatch = configSectionContent
            .substring(blockStartPos)
            .match(/\n\t\t\w{24} \/\*|$/);
          if (nextBlockMatch) {
            const potentialBlockEndPos = blockStartPos + nextBlockMatch.index;
            const potentialBlock = configSectionContent.substring(
              blockStartPos,
              potentialBlockEndPos
            );
            // Find the last "};" in this potential block that matches our block structure
            // Need to find the "};" that closes our specific block, not just any "};"
            let blockBraceCount = 1;
            let blockPos = "= {".length;
            let blockEndPos = -1;

            // Find the matching closing brace for our block
            while (blockPos < potentialBlock.length && blockEndPos === -1) {
              const char = potentialBlock[blockPos];
              if (char === "{") blockBraceCount++;
              if (char === "}") {
                blockBraceCount--;
                if (blockBraceCount === 0) {
                  // Found the closing brace for our block
                  if (
                    blockPos + 1 < potentialBlock.length &&
                    potentialBlock[blockPos + 1] === ";"
                  ) {
                    blockEndPos = blockPos + 2; // +2 for "};"
                  }
                }
              }
              blockPos++;
            }

            if (blockEndPos !== -1) {
              const block = potentialBlock.substring(0, blockEndPos);
              // Check if block contains invalid "Swift" field (without VERSION)

              configBlocks[id] = block;
              foundEnd = true;
            }
          }
        }

        // Final fallback: use non-greedy regex
        if (!foundEnd) {
          const blockRegex = new RegExp(
            `${idPattern} /\\* .*? \\*/ = \\{[\\s\\S]*?\\};`,
            "m"
          );
          const fallbackBlock = configSectionContent.match(blockRegex);
          if (fallbackBlock) {
            configBlocks[id] = fallbackBlock[0];
            foundEnd = true;
          }
        }
      }
    } else {
      // Fallback: search in full content
      const blockRegex = new RegExp(
        `${idPattern} /\\* .*? \\*/ = \\{[\\s\\S]*?\\};`,
        "m"
      );
      const fallbackBlock = content.match(blockRegex);
      if (fallbackBlock) configBlocks[id] = fallbackBlock[0];
    }
  }

  // Validate extracted blocks - ensure they have balanced braces and no duplicate fields
  for (const id of Object.keys(configBlocks)) {
    let block = configBlocks[id];
    const openBraces = (block.match(/\{/g) || []).length;
    const closeBraces = (block.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      // Try to fix by finding the correct end
      const blockStart = block.indexOf("= {");
      if (blockStart !== -1) {
        let braceCount = 1; // Start at 1 because we're already inside the opening brace
        let pos = blockStart + 3; // After "= {"
        let foundEnd = false;

        while (pos < block.length && !foundEnd) {
          const char = block[pos];
          if (char === "{") braceCount++;
          if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              // Found the closing brace
              // Check if next character is semicolon
              if (pos + 1 < block.length && block[pos + 1] === ";") {
                block = block.substring(0, pos + 2); // +2 for "};"
                configBlocks[id] = block;
                foundEnd = true;
              }
            }
          }
          pos++;
        }
      }
    }
    // Ensure block ends with "};"
    if (!block.trim().endsWith("};")) {
      block = block.trim() + "};";
      configBlocks[id] = block;
    }

    // Check for duplicate fields in buildSettings and remove them
    // Need to properly extract buildSettings with nested braces
    const buildSettingsStart = block.indexOf("buildSettings = {");
    if (buildSettingsStart !== -1) {
      let braceCount = 1;
      let pos = buildSettingsStart + "buildSettings = {".length;
      let buildSettingsEnd = -1;

      // Find the matching closing brace for buildSettings
      while (pos < block.length && buildSettingsEnd === -1) {
        const char = block[pos];
        if (char === "{") braceCount++;
        if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            buildSettingsEnd = pos;
          }
        }
        pos++;
      }

      if (buildSettingsEnd !== -1) {
        const buildSettings = block.substring(
          buildSettingsStart + "buildSettings = {".length,
          buildSettingsEnd
        );
        const fieldNames = new Set();
        const lines = buildSettings.split("\n");
        const cleanedLines = [];

        for (const line of lines) {
          // Match field name (e.g., "SWIFT_VERSION", "PRODUCT_NAME", etc.)
          // Also check for "Swift" without "VERSION" - this is invalid
          const fieldMatch = line.match(/^\s*([A-Z_][A-Z0-9_]*|Swift)\s*=/);
          if (fieldMatch) {
            const fieldName = fieldMatch[1];
            // Skip "Swift" without "VERSION" - this is invalid
            if (fieldName === "Swift" && !line.includes("SWIFT_VERSION")) {
              continue;
            }
            if (fieldNames.has(fieldName)) {
              // Skip duplicate field - keep only the first occurrence
              continue;
            }
            fieldNames.add(fieldName);
          }
          cleanedLines.push(line);
        }

        // Reconstruct block with cleaned buildSettings
        const cleanedBuildSettings = cleanedLines.join("\n");
        const beforeBuildSettings = block.substring(
          0,
          buildSettingsStart + "buildSettings = {".length
        );
        const afterBuildSettings = block.substring(buildSettingsEnd);
        block = beforeBuildSettings + cleanedBuildSettings + afterBuildSettings;
        configBlocks[id] = block;
      }
    }
  }

  const baseConfigIds = Object.keys(configBlocks);
  if (baseConfigIds.length === 0) {
    console.log(
      chalk.yellow(
        `⚠️  Could not find any config blocks for IDs: ${configIds.join(", ")}`
      )
    );
    return null;
  }

  const debugBase =
    baseConfigIds.length >= 1 ? configBlocks[baseConfigIds[0]] : null;
  const releaseBase =
    baseConfigIds.length > 1 ? configBlocks[baseConfigIds[1]] : debugBase;
  if (!debugBase || !releaseBase) {
    console.log(
      chalk.yellow(
        `⚠️  Could not find debug/release config blocks. Found ${baseConfigIds.length} blocks.`
      )
    );
    return null;
  }

  console.log(chalk.cyan(`Found base target: ${baseName} (${baseTargetId})`));
  console.log(chalk.cyan(`Creating ${envs.length} environment targets...`));

  const buildableRefs = {
    base: {
      id: baseTargetId,
      name: baseName,
      productName: baseProductName,
      ref: `<BuildableReference\n               BuildableIdentifier = "primary"\n               BlueprintIdentifier = "${baseTargetId}"\n               BuildableName = "${baseProductName}.app"\n               BlueprintName = "${baseName}"\n               ReferencedContainer = "container:${projectName}.xcodeproj">\n            </BuildableReference>`,
    },
    envs: {},
  };

  const baseBuildPhasesMatch = targetBlock.match(/buildPhases = \([\s\S]*?\);/);
  const buildPhasesBlock = baseBuildPhasesMatch ? baseBuildPhasesMatch[0] : "";

  for (const env of envs) {
    console.log(chalk.cyan(`  Creating target for ${env}...`));
    const capEnv = getEnvNameForScheme(env);
    const targetName = `${projectName}${capEnv}`;
    const productName = `${projectName}${capEnv}`;

    const newProductRefId = genId();
    const newTargetId = genId();
    const newConfigListId = genId();
    const newDebugConfigId = genId();
    const newReleaseConfigId = genId();

    // File reference - format exactly like original
    let newProductRef = productRefBlockMatch[0]
      .replace(baseProductRefId, newProductRefId)
      .replace(/\/\* .*?\.app \*\//g, `/* ${productName}.app */`)
      .replace(/path = .*?\.app;/, `path = ${productName}.app;`)
      .replace(/name = .*?\.app;/, `name = ${productName}.app;`);

    // Ensure it ends with semicolon and newline (preserve original format)
    newProductRef = newProductRef.trim();
    if (!newProductRef.endsWith(";")) {
      newProductRef += ";";
    }
    newProductRef += "\n";

    // Insert before the end marker - find last entry and insert after it
    const lastEntryMatch = fileRefSection.match(
      /(\t\t\w{24}[^\n]*;\n)(?=\/\* End PBXFileReference section \*\/)/
    );
    if (lastEntryMatch) {
      fileRefSection = fileRefSection.replace(
        lastEntryMatch[0],
        `${lastEntryMatch[1]}\t\t${newProductRef}`
      );
    } else {
      fileRefSection = fileRefSection.replace(
        "/* End PBXFileReference section */",
        `\t\t${newProductRef}/* End PBXFileReference section */`
      );
    }

    // Build configurations
    const plistName = `${projectName} ${env}-Info.plist`;
    // In working project, environment target configs have names "Debug" and "Release" (without target name prefix)
    // This matches the pattern in lepimvarim where staging configs are just "Debug" and "Release"
    let debugCfg = cloneBuildConfigBlock(
      debugBase,
      newDebugConfigId,
      "Debug",
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    debugCfg = debugCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    // Set bundle identifier for this environment target
    // In lepimvarim: production = com.lepim.varim, staging = com.lepim.varim.staging
    // Format: baseBundleIdentifier.env (lowercase)
    const lowerEnv = env.toLowerCase();
    const envBundleIdentifier = baseBundleIdentifier
      ? `${baseBundleIdentifier}.${lowerEnv}`
      : undefined;

    if (envBundleIdentifier) {
      const beforeBundleReplace = debugCfg;
      debugCfg = debugCfg.replace(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/,
        `PRODUCT_BUNDLE_IDENTIFIER = ${envBundleIdentifier};`
      );
      if (beforeBundleReplace === debugCfg) {
        console.log(
          chalk.yellow(
            `⚠️  Could not replace bundle ID in debug config for ${targetName}. Bundle ID pattern not found.`
          )
        );
      } else {
        console.log(
          chalk.green(
            `✅ Set bundle ID for ${targetName} Debug: ${envBundleIdentifier}`
          )
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  No bundle identifier provided for ${targetName}, using default`
        )
      );
    }

    let releaseCfg = cloneBuildConfigBlock(
      releaseBase,
      newReleaseConfigId,
      "Release",
      plistName
    );
    // Replace PRODUCT_NAME more precisely - only match PRODUCT_NAME field, not other fields
    releaseCfg = releaseCfg.replace(
      /PRODUCT_NAME = [^;]+;/,
      `PRODUCT_NAME = ${targetName};`
    );

    // Set bundle identifier for release config too
    if (envBundleIdentifier) {
      const beforeBundleReplace = releaseCfg;
      releaseCfg = releaseCfg.replace(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/,
        `PRODUCT_BUNDLE_IDENTIFIER = ${envBundleIdentifier};`
      );
      if (beforeBundleReplace === releaseCfg) {
        console.log(
          chalk.yellow(
            `⚠️  Could not replace bundle ID in release config for ${targetName}. Bundle ID pattern not found.`
          )
        );
      } else {
        console.log(
          chalk.green(
            `✅ Set bundle ID for ${targetName} Release: ${envBundleIdentifier}`
          )
        );
      }
    }

    // Remove baseConfigurationReference from environment targets
    // CocoaPods will set the correct reference when 'pod install' is run
    // This prevents errors about missing Pods files before pod install
    debugCfg = debugCfg.replace(
      /baseConfigurationReference\s*=\s*[^;]+;\s*/g,
      ""
    );
    releaseCfg = releaseCfg.replace(
      /baseConfigurationReference\s*=\s*[^;]+;\s*/g,
      ""
    );

    // Set INFOPLIST_KEY_CFBundleDisplayName for environment targets
    // This ensures each environment target has a distinct display name
    // In lepimvarim: staging uses "LepimVarim Staging" (displayName without spaces + " " + env name)
    // Format: `${displayName.replace(/\s+/g, "")} ${getEnvNameForScheme(env)}` for environment targets
    const cleanDisplayName = displayName
      ? displayName.replace(/\s+/g, "")
      : projectName;
    const envDisplayName = `${cleanDisplayName} ${getEnvNameForScheme(env)}`;
    // Check if INFOPLIST_KEY_CFBundleDisplayName already exists
    if (!debugCfg.includes("INFOPLIST_KEY_CFBundleDisplayName")) {
      // Add after INFOPLIST_FILE
      debugCfg = debugCfg.replace(
        /(INFOPLIST_FILE\s*=\s*[^;]+;\s*)/,
        `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";\n`
      );
    } else {
      // Update existing value
      debugCfg = debugCfg.replace(
        /INFOPLIST_KEY_CFBundleDisplayName\s*=\s*[^;]+;/,
        `INFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";`
      );
    }
    if (!releaseCfg.includes("INFOPLIST_KEY_CFBundleDisplayName")) {
      // Add after INFOPLIST_FILE
      releaseCfg = releaseCfg.replace(
        /(INFOPLIST_FILE\s*=\s*[^;]+;\s*)/,
        `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";\n`
      );
    } else {
      // Update existing value
      releaseCfg = releaseCfg.replace(
        /INFOPLIST_KEY_CFBundleDisplayName\s*=\s*[^;]+;/,
        `INFOPLIST_KEY_CFBundleDisplayName = "${envDisplayName}";`
      );
    }

    // Preserve original formatting - blocks should already have correct tabs from cloneBuildConfigBlock
    // XCBuildConfiguration blocks end with "};" on a new line
    // Validate and fix block structure after replacements

    // Ensure blocks end properly - they should end with "};" and newline
    const debugCfgTrimmed = debugCfg.trim();
    if (!debugCfgTrimmed.endsWith("};")) {
      // Try to fix - find the last "};" or add it
      const lastBrace = debugCfgTrimmed.lastIndexOf("}");
      if (
        lastBrace !== -1 &&
        lastBrace + 1 < debugCfgTrimmed.length &&
        debugCfgTrimmed[lastBrace + 1] !== ";"
      ) {
        debugCfg = debugCfgTrimmed.substring(0, lastBrace + 1) + ";\n";
      } else if (!debugCfgTrimmed.endsWith("}")) {
        debugCfg = debugCfgTrimmed + "};\n";
      } else {
        debugCfg = debugCfgTrimmed + ";\n";
      }
    } else if (!debugCfg.endsWith("\n")) {
      debugCfg = debugCfgTrimmed + "\n";
    }

    // Validate block structure - check brace balance
    const debugOpen = (debugCfg.match(/\{/g) || []).length;
    const debugClose = (debugCfg.match(/\}/g) || []).length;
    if (debugOpen !== debugClose) {
      console.log(
        chalk.red(
          `❌ Debug config block brace mismatch: ${debugOpen} open, ${debugClose} close - BLOCK WILL BE SKIPPED`
        )
      );
      // Skip this block to prevent corruption
      continue;
    }

    const releaseCfgTrimmed = releaseCfg.trim();
    if (!releaseCfgTrimmed.endsWith("};")) {
      // Try to fix - find the last "};" or add it
      const lastBrace = releaseCfgTrimmed.lastIndexOf("}");
      if (
        lastBrace !== -1 &&
        lastBrace + 1 < releaseCfgTrimmed.length &&
        releaseCfgTrimmed[lastBrace + 1] !== ";"
      ) {
        releaseCfg = releaseCfgTrimmed.substring(0, lastBrace + 1) + ";\n";
      } else if (!releaseCfgTrimmed.endsWith("}")) {
        releaseCfg = releaseCfgTrimmed + "};\n";
      } else {
        releaseCfg = releaseCfgTrimmed + ";\n";
      }
    } else if (!releaseCfg.endsWith("\n")) {
      releaseCfg = releaseCfgTrimmed + "\n";
    }

    // Validate block structure - check brace balance
    const releaseOpen = (releaseCfg.match(/\{/g) || []).length;
    const releaseClose = (releaseCfg.match(/\}/g) || []).length;
    if (releaseOpen !== releaseClose) {
      console.log(
        chalk.red(
          `❌ Release config block brace mismatch: ${releaseOpen} open, ${releaseClose} close - BLOCK WILL BE SKIPPED`
        )
      );
      // Skip this block to prevent corruption
      continue;
    }

    // Insert before the end marker
    // XCBuildConfiguration blocks are multiline and end with "};"
    // Simply insert before the end marker to preserve structure
    configSection = configSection.replace(
      "/* End XCBuildConfiguration section */",
      `${debugCfg}${releaseCfg}/* End XCBuildConfiguration section */`
    );

    // In working project, config list comments use just "Debug" and "Release" (matching the config names)
    let newConfigList = `\t\t${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${newDebugConfigId} /* Debug */,\n\t\t\t\t${newReleaseConfigId} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};`;

    // CRITICAL: Verify that newConfigList uses correct config IDs
    const newConfigListConfigIds = newConfigList.match(/\w{24}/g) || [];
    const expectedConfigIds = [
      newConfigListId,
      newDebugConfigId,
      newReleaseConfigId,
    ];
    const hasCorrectIds = expectedConfigIds.every(id =>
      newConfigListConfigIds.includes(id)
    );
    if (!hasCorrectIds) {
      console.log(
        chalk.red(
          `❌ CRITICAL: newConfigList does not contain expected config IDs!`
        )
      );
    }

    // Ensure config list ends properly
    newConfigList = newConfigList.trim();
    if (!newConfigList.endsWith(";")) {
      newConfigList += ";";
    }
    newConfigList += "\n";

    // CRITICAL: Store expected config IDs before insertion
    const expectedConfigIdsBeforeInsert = [
      newDebugConfigId,
      newReleaseConfigId,
    ];

    // Insert before the end marker - find last complete block and insert after it
    // XCConfigurationList blocks are multiline and end with "};"
    const lastConfigListBlockMatch = configListSection.match(
      /(\t\t\w{24}[^}]*\};\n)(?=\/\* End XCConfigurationList section \*\/)/
    );
    const beforeInsert = configListSection;
    if (lastConfigListBlockMatch) {
      configListSection = configListSection.replace(
        lastConfigListBlockMatch[0],
        `${lastConfigListBlockMatch[1]}${newConfigList}`
      );
    } else {
      configListSection = configListSection.replace(
        "/* End XCConfigurationList section */",
        `${newConfigList}/* End XCConfigurationList section */`
      );
    }

    // Verify that newConfigList was added
    if (beforeInsert === configListSection) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Failed to add config list for ${targetName} to configListSection!`
        )
      );
    } else {
      // Verify the config list is in configListSection
      const verifyMatch = configListSection.match(
        new RegExp(
          `${newConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}"\\s*\\*/`
        )
      );
      if (!verifyMatch) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list for ${targetName} NOT found in configListSection after insertion!`
          )
        );
      }
    }

    // Native target - replace specific fields to avoid double replacement
    // IMPORTANT: Replace config list ID FIRST, before other ID replacements
    // This is critical - staging target MUST have its own config list ID
    const escapedBaseConfigListId = baseConfigListId.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    // Replace config list ID FIRST - use exact pattern matching
    // Format: buildConfigurationList = <ID> /* Build configuration list for PBXNativeTarget "..." */
    let newTarget = targetBlock;

    // CRITICAL: Replace config list ID FIRST, before any other replacements
    // Find the exact line with buildConfigurationList
    const configListLineMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})\s*\/\*\s*Build configuration list for PBXNativeTarget "[^"]*"\s*\*\//
    );

    if (configListLineMatch) {
      const currentConfigListId = configListLineMatch[1];

      // Replace it with newConfigListId - use a very precise pattern
      const replacePattern = new RegExp(
        `(buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
        "g"
      );

      const beforeReplace = newTarget;
      // CRITICAL: Replace with correct comment for this target
      newTarget = newTarget.replace(
        replacePattern,
        `$1${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );

      if (beforeReplace === newTarget) {
        console.log(
          chalk.red(
            `❌ ERROR: Replacement did not work! Pattern: ${replacePattern}`
          )
        );
      } else {
      }
    } else {
      console.log(
        chalk.red(
          `❌ ERROR: Could not find buildConfigurationList line in targetBlock!`
        )
      );
      // Try to find it without the comment
      const simpleMatch = newTarget.match(
        /buildConfigurationList\s*=\s*(\w{24})/
      );
      if (simpleMatch) {
        console.log(
          chalk.yellow(
            `⚠️  Found buildConfigurationList without comment: ${simpleMatch[1]}`
          )
        );
        // Try to replace it anyway - add correct comment
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${simpleMatch[1].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)?`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
        console.log(
          chalk.yellow(`⚠️  Attempted replacement without comment pattern`)
        );
      }
    }

    // Verify the replacement worked before continuing
    const verifyConfigListMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (verifyConfigListMatch) {
      const actualConfigListId = verifyConfigListMatch[1];
      if (actualConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL ERROR: Config list ID replacement failed! Expected ${newConfigListId}, but found ${actualConfigListId}`
          )
        );
        // Force the replacement if it failed
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${actualConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      } else {
      }
    }

    // Now replace other IDs - but be careful not to replace the config list ID again
    // IMPORTANT: Replace baseTargetId and baseProductRefId, but NOT newConfigListId
    // We need to protect newConfigListId from being replaced
    const escapedNewConfigListId = newConfigListId.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    // Replace baseTargetId, but be VERY careful not to replace config list ID
    // We need to protect newConfigListId from being replaced
    // Strategy: replace baseTargetId only if it's NOT part of buildConfigurationList line
    // and NOT the same as newConfigListId
    if (baseTargetId !== newConfigListId) {
      // Use a more precise pattern that explicitly excludes buildConfigurationList context
      newTarget = newTarget.replace(
        new RegExp(
          `(?<!buildConfigurationList\\s*=\\s*)${baseTargetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(?!\\s*/\\*\\s*Build configuration list)`,
          "g"
        ),
        newTargetId
      );
    } else {
    }

    // Replace baseProductRefId, but protect newConfigListId
    if (baseProductRefId !== newConfigListId) {
      newTarget = newTarget.replace(
        new RegExp(
          `${baseProductRefId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "g"
        ),
        newProductRefId
      );
    } else {
    }

    // Final verification: ensure config list ID is still correct after other replacements
    const finalVerifyMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (finalVerifyMatch && finalVerifyMatch[1] !== newConfigListId) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list ID was overwritten! Restoring to ${newConfigListId}`
        )
      );
      newTarget = newTarget.replace(
        new RegExp(
          `buildConfigurationList\\s*=\\s*${finalVerifyMatch[1].replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "g"
        ),
        `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );
    }

    // Then replace names in specific places (avoiding global replace)
    newTarget = newTarget.replace(
      new RegExp(`name = ${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`),
      `name = ${targetName};`
    );
    newTarget = newTarget.replace(
      new RegExp(
        `productName = ${baseProductName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )};`
      ),
      `productName = ${productName};`
    );

    // Replace in comment at the start of target block
    newTarget = newTarget.replace(
      new RegExp(
        `${newTargetId} /\\* ${baseName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )} \\*/`
      ),
      `${newTargetId} /* ${targetName} */`
    );
    newTarget = newTarget.replace(
      /productType = .*?;/,
      'productType = "com.apple.product-type.application";'
    );
    newTarget = newTarget.replace(
      new RegExp(`productReference = ${newProductRefId} /\\* .*?\\.app \\*/;`),
      `productReference = ${newProductRefId} /* ${productName}.app */;`
    );

    // Verify config list ID is still correct after name/product replacements
    const afterNameCheck = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (afterNameCheck && afterNameCheck[1] !== newConfigListId) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list ID was overwritten after name/product replacements! Restoring...`
        )
      );
      newTarget = newTarget.replace(
        new RegExp(
          `buildConfigurationList\\s*=\\s*${afterNameCheck[1].replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
          "g"
        ),
        `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
      );
    }

    // Create new build phases with new IDs for this target
    // In lepimvarim, each target has its own build phases with unique IDs
    // We need to create Sources, Frameworks, Resources, and Bundle React Native build phases
    // Pods build phases will be created by CocoaPods when 'pod install' is run
    const newSourcesPhaseId = genId();
    const newFrameworksPhaseId = genId();
    const newResourcesPhaseId = genId();
    const newBundleRnPhaseId = genId();

    // Find base build phases to copy structure from
    let baseSourcesPhase = null;
    let baseFrameworksPhase = null;
    let baseResourcesPhase = null;
    let baseBundleRnPhase = null;

    if (buildPhasesBlock) {
      const buildPhaseIds = buildPhasesBlock.match(/\w{24}/g) || [];

      for (const phaseId of buildPhaseIds) {
        // Find build phase block in content
        const phaseBlockMatch = content.match(
          new RegExp(
            `${phaseId}\\s*\\/\\*\\s*([^*]+)\\s*\\*\\/\\s*=\\s*\\{([\\s\\S]*?)\\};`,
            "m"
          )
        );
        if (!phaseBlockMatch) continue;

        const phaseName = phaseBlockMatch[1].trim();
        const phaseContent = phaseBlockMatch[2];

        // Identify phase type and copy structure (skip Pods phases - CocoaPods will create them)
        if (phaseName === "Sources" && !phaseName.includes("[CP]")) {
          baseSourcesPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName === "Frameworks" && !phaseName.includes("[CP]")) {
          baseFrameworksPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName === "Resources" && !phaseName.includes("[CP]")) {
          baseResourcesPhase = { id: phaseId, content: phaseContent };
        } else if (phaseName.includes("Bundle React Native")) {
          baseBundleRnPhase = { id: phaseId, content: phaseContent };
        }
      }
    }

    // Create new build phases blocks
    // In reference project, each target's Sources phase contains only AppDelegate.swift
    // We need to find AppDelegate.swift from base Sources phase and add it to new Sources phase
    const sourcesSectionMatch = content.match(
      /\/\* Begin PBXSourcesBuildPhase section \*\/[\s\S]*?\/\* End PBXSourcesBuildPhase section \*\//m
    );
    if (sourcesSectionMatch && baseSourcesPhase) {
      // Extract files from base Sources phase - we only need AppDelegate.swift
      const baseFilesMatch = baseSourcesPhase.content.match(
        /files\s*=\s*\(([\s\S]*?)\);/
      );
      let newSourcesFiles = "";

      if (baseFilesMatch) {
        const baseFilesContent = baseFilesMatch[1];
        // Find AppDelegate.swift buildFile reference
        const appDelegateMatch = baseFilesContent.match(
          /(\w{24})\s*\/\*\s*AppDelegate\.swift\s+in\s+Sources\s*\*/
        );

        if (appDelegateMatch) {
          const existingBuildFileId = appDelegateMatch[1];

          // Find existing PBXBuildFile block to get fileRef
          const existingBuildFileBlock = content.match(
            new RegExp(
              `${existingBuildFileId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}\\s*/\\*\\s*AppDelegate\\.swift\\s+in\\s+Sources\\s*\\*/\\s*=\\s*\\{[^}]*fileRef\\s*=\\s*(\\w{24})[^}]*\\};`,
              "m"
            )
          );

          if (existingBuildFileBlock) {
            const fileRefId = existingBuildFileBlock[1];
            // Create new PBXBuildFile entry with new ID but same fileRef
            const newBuildFileId = genId();
            const buildFileContent = `\t\t${newBuildFileId} /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* AppDelegate.swift */; };`;

            // Add new PBXBuildFile entry to PBXBuildFile section
            content = content.replace(
              /(\/\* End PBXBuildFile section \*\/)/,
              `${buildFileContent}\n$1`
            );

            // Add to new Sources phase files list
            newSourcesFiles = `\t\t\t\t${newBuildFileId} /* AppDelegate.swift in Sources */,\n`;
          }
        }
      }

      // Create new Sources phase block with AppDelegate.swift only
      const newSourcesBlock = `\t\t${newSourcesPhaseId} /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${newSourcesFiles}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXSourcesBuildPhase section \*\/)/,
        `${newSourcesBlock}$1`
      );
    }

    const frameworksSectionMatch = content.match(
      /\/\* Begin PBXFrameworksBuildPhase section \*\/[\s\S]*?\/\* End PBXFrameworksBuildPhase section \*\//m
    );
    if (frameworksSectionMatch && baseFrameworksPhase) {
      const newFrameworksBlock = `\t\t${newFrameworksPhaseId} /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXFrameworksBuildPhase section \*\/)/,
        `${newFrameworksBlock}$1`
      );
    }

    // Create Resources phase and copy all files from base Resources phase
    // In reference project, staging Resources phase contains all the same files as base,
    // but with different buildFile IDs (same fileRef)
    const resourcesSectionMatch = content.match(
      /\/\* Begin PBXResourcesBuildPhase section \*\/[\s\S]*?\/\* End PBXResourcesBuildPhase section \*\//m
    );
    if (resourcesSectionMatch && baseResourcesPhase) {
      // Extract files from base Resources phase
      const baseFilesMatch = baseResourcesPhase.content.match(
        /files\s*=\s*\(([\s\S]*?)\);/
      );
      let newResourcesFiles = "";

      if (baseFilesMatch) {
        const baseFilesContent = baseFilesMatch[1];
        // Extract all buildFile references from base Resources phase
        const buildFileRefs =
          baseFilesContent.match(/(\w{24})\s*\/\*\s*([^*]+)\s*\*/g) || [];

        // For each buildFile, create a new PBXBuildFile entry with new ID but same fileRef
        const buildFileSectionMatch = content.match(
          /\/\* Begin PBXBuildFile section \*\/[\s\S]*?\/\* End PBXBuildFile section \*\//m
        );

        if (buildFileSectionMatch) {
          const newBuildFileEntries = [];

          for (const buildFileRef of buildFileRefs) {
            // Extract buildFile ID and file name
            const buildFileMatch = buildFileRef.match(
              /(\w{24})\s*\/\*\s*([^*]+)\s*\*/
            );
            if (buildFileMatch) {
              const existingBuildFileId = buildFileMatch[1];
              const fileName = buildFileMatch[2].trim();

              // Find existing PBXBuildFile block to get fileRef
              const existingBuildFileBlock = content.match(
                new RegExp(
                  `${existingBuildFileId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}\\s*/\\*\\s*${fileName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}\\s*\\*/\\s*=\\s*\\{[^}]*fileRef\\s*=\\s*(\\w{24})[^}]*\\};`,
                  "m"
                )
              );

              if (existingBuildFileBlock) {
                const fileRefId = existingBuildFileBlock[1];
                // Extract file name without " in Resources" suffix for fileRef comment
                const fileRefName = fileName.split(" in ")[0];
                // Create new PBXBuildFile entry with new ID but same fileRef
                const newBuildFileId = genId();
                const buildFileContent = `\t\t${newBuildFileId} /* ${fileName} */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* ${fileRefName} */; };`;
                newBuildFileEntries.push({
                  buildFileId: newBuildFileId,
                  fileName: fileName,
                  buildFileContent: buildFileContent,
                });

                // Add to new Resources phase files list
                newResourcesFiles += `\t\t\t\t${newBuildFileId} /* ${fileName} */,\n`;
              }
            }
          }

          // Add new PBXBuildFile entries to PBXBuildFile section
          if (newBuildFileEntries.length > 0) {
            const buildFileEntries = newBuildFileEntries
              .map(entry => entry.buildFileContent)
              .join("\n");
            content = content.replace(
              /(\/\* End PBXBuildFile section \*\/)/,
              `${buildFileEntries}\n$1`
            );
          }
        }
      }

      // Create new Resources phase block with files
      const newResourcesBlock = `\t\t${newResourcesPhaseId} /* Resources */ = {\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${newResourcesFiles}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
      content = content.replace(
        /(\/\* End PBXResourcesBuildPhase section \*\/)/,
        `${newResourcesBlock}$1`
      );
    }

    // Copy Bundle React Native phase if it exists
    if (baseBundleRnPhase) {
      // Find the block start
      const blockStartRegex = new RegExp(
        `(\\t\\t)${baseBundleRnPhase.id.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\/\\*\\s*([^*]+)\\s*\\*\\/\\s*=\\s*\\{`,
        "m"
      );
      const blockStartMatch = content.match(blockStartRegex);
      if (blockStartMatch) {
        const indent = blockStartMatch[1];
        const comment = blockStartMatch[2].trim();
        const blockStartPos = blockStartMatch.index + blockStartMatch[0].length;

        // Find the closing }; by counting braces
        let braceCount = 1; // Already inside opening brace
        let pos = blockStartPos;
        let foundEnd = false;
        let blockEndPos = -1;

        while (pos < content.length && !foundEnd) {
          const char = content[pos];
          if (char === "{") braceCount++;
          if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              // Check if next char is semicolon
              if (pos + 1 < content.length && content[pos + 1] === ";") {
                blockEndPos = pos + 2; // Include };
                foundEnd = true;
              }
            }
          }
          pos++;
        }

        if (foundEnd && blockEndPos > 0) {
          // Extract the complete block
          const originalBlock = content.substring(
            blockStartMatch.index,
            blockEndPos
          );
          // Replace ID with new ID
          const newBundleRnBlock = originalBlock.replace(
            new RegExp(
              baseBundleRnPhase.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "g"
            ),
            newBundleRnPhaseId
          );

          const shellScriptSectionMatch = content.match(
            /\/\* Begin PBXShellScriptBuildPhase section \*\/[\s\S]*?\/\* End PBXShellScriptBuildPhase section \*\//m
          );
          if (shellScriptSectionMatch) {
            content = content.replace(
              /(\/\* End PBXShellScriptBuildPhase section \*\/)/,
              `${newBundleRnBlock}\n$1`
            );
          }
        }
      }
    }

    // Create buildPhases list with new IDs (Pods phases will be added by CocoaPods)
    let newBuildPhasesBlock = "buildPhases = (\n";
    // Order: Sources, Frameworks, Resources, Bundle React Native (Pods phases will be added by CocoaPods)
    newBuildPhasesBlock += `\t\t\t\t${newSourcesPhaseId} /* Sources */,\n`;
    newBuildPhasesBlock += `\t\t\t\t${newFrameworksPhaseId} /* Frameworks */,\n`;
    newBuildPhasesBlock += `\t\t\t\t${newResourcesPhaseId} /* Resources */,\n`;
    if (baseBundleRnPhase) {
      newBuildPhasesBlock += `\t\t\t\t${newBundleRnPhaseId} /* Bundle React Native code and images */,\n`;
    }
    newBuildPhasesBlock += "\t\t\t);";

    // Replace buildPhases in new target
    const buildPhasesRegex = /buildPhases = \([\s\S]*?\);/m;
    if (buildPhasesRegex.test(newTarget)) {
      newTarget = newTarget.replace(buildPhasesRegex, newBuildPhasesBlock);

      // Verify config list ID is still correct after buildPhases replacement
      const afterBuildPhasesCheck = newTarget.match(
        /buildConfigurationList\s*=\s*(\w{24})/
      );
      if (
        afterBuildPhasesCheck &&
        afterBuildPhasesCheck[1] !== newConfigListId
      ) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list ID was overwritten after buildPhases replacement! Restoring...`
          )
        );
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${afterBuildPhasesCheck[1].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      }
    }
    // Preserve original formatting from targetBlock
    // CRITICAL: Final check before inserting - ensure config list ID is correct
    const finalCheckMatch = newTarget.match(
      /buildConfigurationList\s*=\s*(\w{24})/
    );
    if (finalCheckMatch) {
      const finalConfigListId = finalCheckMatch[1];
      if (finalConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list ID is wrong before insertion! Expected ${newConfigListId}, found ${finalConfigListId}. Fixing...`
          )
        );
        // Force replace one more time
        newTarget = newTarget.replace(
          new RegExp(
            `buildConfigurationList\\s*=\\s*${finalConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "g"
          ),
          `buildConfigurationList = ${newConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
      } else {
      }
    } else {
      console.log(
        chalk.red(
          `❌ CRITICAL: Could not find buildConfigurationList in newTarget before insertion!`
        )
      );
    }

    // Ensure target block ends properly
    newTarget = newTarget.trim();
    if (!newTarget.endsWith(";")) {
      newTarget += ";";
    }
    newTarget += "\n";

    // Insert before the end marker - find last complete block and insert after it
    // PBXNativeTarget blocks are multiline and end with "};"
    const lastNativeBlockMatch = nativeSection.match(
      /(\t\t\w{24}[^}]*\};\n)(?=\/\* End PBXNativeTarget section \*\/)/
    );
    if (lastNativeBlockMatch) {
      nativeSection = nativeSection.replace(
        lastNativeBlockMatch[0],
        `${lastNativeBlockMatch[1]}${newTarget}`
      );
    } else {
      nativeSection = nativeSection.replace(
        "/* End PBXNativeTarget section */",
        `${newTarget}/* End PBXNativeTarget section */`
      );
    }

    // CRITICAL: Verify that the inserted newTarget still has correct config list ID
    const insertedTargetMatch = nativeSection.match(
      new RegExp(
        `${newTargetId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})`
      )
    );
    if (insertedTargetMatch) {
      const insertedConfigListId = insertedTargetMatch[1];
      if (insertedConfigListId !== newConfigListId) {
        console.log(
          chalk.red(
            `❌ CRITICAL: After insertion, config list ID is wrong! Expected ${newConfigListId}, found ${insertedConfigListId}. Fixing in nativeSection...`
          )
        );
        // Fix it in nativeSection
        nativeSection = nativeSection.replace(
          new RegExp(
            `(${newTargetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${insertedConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*\\/)`,
            "m"
          ),
          `$1${newConfigListId}$2`
        );
      } else {
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Could not find inserted target ${newTargetId} in nativeSection for verification`
        )
      );
    }

    buildableRefs.envs[env] = {
      id: newTargetId,
      name: targetName,
      productName,
      ref: `<BuildableReference\n               BuildableIdentifier = "primary"\n               BlueprintIdentifier = "${newTargetId}"\n               BuildableName = "${productName}.app"\n               BlueprintName = "${targetName}"\n               ReferencedContainer = "container:${projectName}.xcodeproj">\n            </BuildableReference>`,
    };

    // Products children
    productsChildren += `\n\t\t\t\t${newProductRefId} /* ${productName}.app */,`;

    // Project targets list
    projectTargets += `\n\t\t\t${newTargetId} /* ${targetName} */,`;

    // Add to TargetAttributes
    targetAttributes += `\n\t\t\t${newTargetId} = {\n\t\t\t\tLastSwiftMigration = 1120;\n\t\t\t};`;
  }

  // Reassemble content
  if (productsMatch) {
    const newProducts = productsMatch[0].replace(
      productsMatch[1],
      productsChildren
    );
    content = content.replace(productsGroupRegex, newProducts);
  }
  if (projectTargetsMatch) {
    const newTargetsBlock = projectTargetsMatch[0].replace(
      projectTargetsMatch[1],
      projectTargets
    );
    content = content.replace(projectTargetsRegex, newTargetsBlock);
  }

  // Update TargetAttributes
  if (targetAttributesMatch && targetAttributes) {
    const newTargetAttributes = targetAttributesMatch[0].replace(
      targetAttributesMatch[1],
      targetAttributes
    );
    content = content.replace(targetAttributesRegex, newTargetAttributes);
  }

  content = content.replace(fileRefSectionRe, fileRefSection);

  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to snapshot or verify
  // before replacement. The staging target should already have the correct buildConfigurationList ID
  // from createIosTargetsForEnvs.

  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks. The fix was only:
  // 1. Renamed comments in XCBuildConfiguration blocks (from "lepimvarimStg Debug" to "Debug")
  // 2. Removed duplicate configurations
  // 3. Fixed scheme file
  // So we don't need to verify or fix buildConfigurationList in nativeSection before replacement.
  // The staging target should already have the correct buildConfigurationList ID from createIosTargetsForEnvs.

  // Now replace nativeSection
  // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
  // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to verify or fix after replacement
  content = content.replace(nativeSectionRe, nativeSection);

  // CRITICAL: Before replacing configListSection, verify that staging config lists are present
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Check if staging config list exists in configListSection
    const stagingConfigListMatch = configListSection.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!stagingConfigListMatch) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list for ${targetName} NOT found in configListSection before replacement!`
        )
      );
    } else {
      console.log(
        chalk.green(
          `✅ Verified: Config list for ${targetName} (ID: ${stagingConfigListMatch[1]}) found in configListSection before replacement`
        )
      );
    }
  }

  // CRITICAL: Before replacing configListSection, save staging config list IDs and their config IDs
  const stagingConfigListIds = {};
  const stagingConfigIds = {}; // Store expected config IDs for each staging target
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    const stagingConfigListMatch = configListSection.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
        "m"
      )
    );

    if (stagingConfigListMatch) {
      const configListId = stagingConfigListMatch[1];
      const configIdsInList = stagingConfigListMatch[2].match(/\w{24}/g) || [];
      stagingConfigListIds[targetName] = configListId;
      stagingConfigIds[targetName] = configIdsInList;
      console.log(
        chalk.cyan(
          `📸 Saved staging config list ID before replacement: ${targetName} -> ${configListId} with config IDs: ${configIdsInList.join(
            ", "
          )}`
        )
      );
    }
  }

  // CRITICAL: Before replacing, verify configListSection contains environment config lists
  console.log(
    chalk.cyan(
      `📸 configListSection length before replacement: ${configListSection.length}`
    )
  );
  // Check for all environment config lists (not just staging)
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;
    const envConfigListPattern = new RegExp(
      `Build configuration list for PBXNativeTarget "${targetName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}"`,
      "g"
    );
    const envConfigListsInSection =
      configListSection.match(envConfigListPattern);
    if (envConfigListsInSection) {
      console.log(
        chalk.green(
          `✅ Found ${envConfigListsInSection.length} config list(s) for ${targetName} in configListSection before replacement`
        )
      );
    } else {
      console.log(
        chalk.red(
          `❌ CRITICAL: NO config list found for ${targetName} in configListSection before replacement!`
        )
      );
    }
  }

  const beforeConfigListReplace = content;
  const configListSectionMatch = content.match(configListSectionRe);
  if (configListSectionMatch) {
    console.log(
      chalk.cyan(
        `📸 Found configListSection in content, length: ${configListSectionMatch[0].length}`
      )
    );
  } else {
    console.log(
      chalk.red(
        `❌ CRITICAL: Could not find configListSection in content using regex!`
      )
    );
  }

  content = content.replace(configListSectionRe, configListSection);

  // CRITICAL: Verify that staging config lists still have correct config IDs after replacement
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    if (stagingConfigListIds[targetName] && stagingConfigIds[targetName]) {
      const expectedConfigListId = stagingConfigListIds[targetName];
      const expectedConfigIds = stagingConfigIds[targetName];

      // Find config list in content after replacement
      const configListMatch = content.match(
        new RegExp(
          `${expectedConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
          "m"
        )
      );

      if (configListMatch) {
        const actualConfigIds = configListMatch[1].match(/\w{24}/g) || [];
        const matches = expectedConfigIds.every(id =>
          actualConfigIds.includes(id)
        );
        if (!matches) {
          console.log(
            chalk.red(
              `❌ AFTER configListSection replacement: ${targetName} config list has WRONG config IDs!`
            )
          );
          console.log(
            chalk.red(
              `   Expected: ${expectedConfigIds.join(
                ", "
              )}, Found: ${actualConfigIds.join(", ")}`
            )
          );
        } else {
          console.log(
            chalk.green(
              `✅ AFTER configListSection replacement: ${targetName} config list has correct config IDs: ${actualConfigIds.join(
                ", "
              )}`
            )
          );
        }
      }
    }
  }
  const afterConfigListReplace = content;

  // CRITICAL: Verify that configListSection replacement worked
  if (beforeConfigListReplace === afterConfigListReplace) {
    console.log(
      chalk.red(
        `❌ CRITICAL: configListSection replacement did NOT occur! The regex did not match!`
      )
    );
  } else {
    console.log(
      chalk.green(`✅ configListSection replacement occurred successfully`)
    );
  }

  // CRITICAL: Verify that staging config lists are still present after replacement
  for (const [targetName, expectedConfigListId] of Object.entries(
    stagingConfigListIds
  )) {
    const stagingConfigListAfterMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!stagingConfigListAfterMatch) {
      console.log(
        chalk.red(
          `❌ CRITICAL: Config list for ${targetName} (ID: ${expectedConfigListId}) NOT found in content after replacement!`
        )
      );
    } else {
      const actualConfigListId = stagingConfigListAfterMatch[1];
      if (actualConfigListId === expectedConfigListId) {
        console.log(
          chalk.green(
            `✅ Verified: Config list for ${targetName} (ID: ${actualConfigListId}) preserved after replacement`
          )
        );
      } else {
        console.log(
          chalk.red(
            `❌ CRITICAL: Config list for ${targetName} has wrong ID! Expected ${expectedConfigListId}, found ${actualConfigListId}`
          )
        );
      }
    }
  }

  content = content.replace(configSectionRe, configSection);

  // CRITICAL: Verify that new config blocks were added to content
  // Check if newDebugConfigId and newReleaseConfigId exist in content after replacement
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find the config list ID for this target
    const targetConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );
    if (targetConfigListMatch) {
      const targetConfigListId = targetConfigListMatch[1];
      // Find config IDs in this config list
      const configListBlockMatch = content.match(
        new RegExp(
          `${targetConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
          "m"
        )
      );
      if (configListBlockMatch) {
        const configIdsInList = configListBlockMatch[1].match(/\w{24}/g) || [];
        console.log(
          chalk.cyan(
            `📋 After configSection replacement, ${targetName} config list contains: ${configIdsInList.join(
              ", "
            )}`
          )
        );

        // Check if these config IDs exist in configSection
        const configIdsExist = configIdsInList.every(id => {
          const exists = content.includes(`${id} /*`);
          if (!exists) {
            console.log(
              chalk.red(
                `❌ Config ID ${id} referenced in ${targetName} config list but NOT found in content!`
              )
            );
          }
          return exists;
        });
        if (!configIdsExist) {
          console.log(
            chalk.red(
              `❌ CRITICAL: Some config IDs in ${targetName} config list are missing from content!`
            )
          );
        }
      }
    }
  }

  // NOTE: In the reference project, there were NO fixes after nativeSection replacement
  // The fix was only in nativeSection before replacement (which we do above)
  // So we don't need to verify or fix after replacement

  // NOTE: In the reference project, there were NO final fixes after all replacements
  // The fix was only in nativeSection before replacement (which we do above)
  // So we don't need to verify or fix after all replacements

  // Validate that all blocks are properly closed
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    console.log(
      chalk.yellow(
        `⚠️  Warning: Mismatched braces in project.pbxproj (${openBraces} open, ${closeBraces} close)`
      )
    );

    // Try to find where the mismatch occurs by checking each section
    const sections = [
      { name: "PBXFileReference", content: fileRefSection },
      { name: "PBXNativeTarget", content: nativeSection },
      { name: "XCBuildConfiguration", content: configSection },
      { name: "XCConfigurationList", content: configListSection },
    ];

    for (const section of sections) {
      const sectionOpen = (section.content.match(/\{/g) || []).length;
      const sectionClose = (section.content.match(/\}/g) || []).length;
      if (sectionOpen !== sectionClose) {
        console.log(
          chalk.yellow(
            `  ⚠️  Mismatch in ${section.name} section: ${sectionOpen} open, ${sectionClose} close`
          )
        );
      }
    }
  }

  // Check for common syntax errors - missing semicolons after key-value pairs
  // Look for patterns like "ID" = { ... } without semicolon before closing brace of parent
  const missingSemicolonPattern = /(\w{24}\s*=\s*\{[^}]*\}\s*)(?!;)/g;
  const missingSemicolonMatches = content.match(missingSemicolonPattern);
  if (missingSemicolonMatches && missingSemicolonMatches.length > 0) {
    console.log(
      chalk.yellow(
        `⚠️  Warning: Found ${missingSemicolonMatches.length} potential missing semicolons in project.pbxproj`
      )
    );
  }

  // Add SWIFT_VERSION to project-level configurations (Debug and Release for PBXProject)
  // Project-level configs have name = Debug; or name = Release; (without target name prefix)
  // Find all config blocks and check if they are project-level (name doesn't contain target name)
  const configBlockRegex =
    /(\w{24}\s*\/\*\s*([^*]+)\s*\*\/\s*=\s*\{[\s\S]*?buildSettings\s*=\s*\{)([\s\S]*?)(\};[\s\S]*?name\s*=\s*([^;]+);[\s\S]*?\};)/g;
  content = content.replace(
    configBlockRegex,
    (
      match,
      beforeBuildSettings,
      commentName,
      buildSettings,
      afterBuildSettings,
      nameValue
    ) => {
      // Check if this is a project-level config (name is exactly "Debug" or "Release" without target name)
      // Remove quotes if present and trim
      const cleanName = nameValue.replace(/^["']|["']$/g, "").trim();
      const isProjectConfig =
        (cleanName === "Debug" || cleanName === "Release") &&
        !commentName.includes(projectName) &&
        !nameValue.includes(projectName);

      if (isProjectConfig && !buildSettings.includes("SWIFT_VERSION")) {
        // For Debug: add after SWIFT_ACTIVE_COMPILATION_CONDITIONS, before USE_HERMES
        if (cleanName === "Debug") {
          if (buildSettings.includes("SWIFT_ACTIVE_COMPILATION_CONDITIONS")) {
            buildSettings = buildSettings.replace(
              /(SWIFT_ACTIVE_COMPILATION_CONDITIONS\s*=\s*"[^"]+";\n)/,
              "$1\t\t\t\tSWIFT_VERSION = 5.0;\n"
            );
          } else if (buildSettings.includes("USE_HERMES")) {
            buildSettings = buildSettings.replace(
              /(USE_HERMES\s*=\s*[^;]+;\n)/,
              "\t\t\t\tSWIFT_VERSION = 5.0;\n$1"
            );
          } else {
            // Fallback: add before closing brace
            buildSettings = buildSettings.replace(
              /(\n\t\t\t\};)/,
              "\n\t\t\t\tSWIFT_VERSION = 5.0;$1"
            );
          }
        }
        // For Release: add after SDKROOT, before USE_HERMES
        else if (cleanName === "Release") {
          if (buildSettings.includes("SDKROOT")) {
            buildSettings = buildSettings.replace(
              /(SDKROOT\s*=\s*[^;]+;\n)/,
              "$1\t\t\t\tSWIFT_VERSION = 5.0;\n"
            );
          } else if (buildSettings.includes("USE_HERMES")) {
            buildSettings = buildSettings.replace(
              /(USE_HERMES\s*=\s*[^;]+;\n)/,
              "\t\t\t\tSWIFT_VERSION = 5.0;\n$1"
            );
          } else {
            // Fallback: add before closing brace
            buildSettings = buildSettings.replace(
              /(\n\t\t\t\};)/,
              "\n\t\t\t\tSWIFT_VERSION = 5.0;$1"
            );
          }
        }
        return beforeBuildSettings + buildSettings + afterBuildSettings;
      }
      return match;
    }
  );

  // Update Pods file names in build phases for multi-environment setup
  // CocoaPods creates files with names like Pods-{projectName}CommonPods-{targetName}
  // instead of Pods-{projectName} for multi-environment projects
  // Update base target: Pods-{projectName} -> Pods-{projectName}CommonPods-{projectName}
  const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const basePodsPattern = new RegExp(
    `(Target Support Files/Pods-)${escapedProjectName}(/)`,
    "g"
  );
  const basePodsReplacement = `$1${projectName}CommonPods-${projectName}$2`;
  content = content.replace(basePodsPattern, basePodsReplacement);

  // Update environment targets: Pods-{projectName}CommonPods-{projectName} -> Pods-{projectName}CommonPods-{targetName}
  for (const env of envs) {
    const capEnv = getEnvNameForScheme(env);
    const envTargetName = `${projectName}${capEnv}`;
    const envPodsPattern = new RegExp(
      `(Target Support Files/Pods-${escapedProjectName}CommonPods-)${escapedProjectName}(/)`,
      "g"
    );
    // Only replace in paths that are for this environment target's build phases
    // We need to be careful not to replace base target's paths
    // The pattern will match, but we'll replace only in environment-specific contexts
    // Actually, CocoaPods will handle this during pod install, so we just need to
    // update base target references
  }

  // Ensure all PBXFileReference objects for Pods libraries are in Frameworks group
  // This prevents "no parent for object" errors
  // IMPORTANT: Do this AFTER all sections have been updated in content
  // Find Frameworks group (re-find it in case content was modified)
  const frameworksGroupRegex =
    /(\w{24})\s*\/\*\s*Frameworks\s*\*\/\s*=\s*\{[\s\S]*?isa = PBXGroup;[\s\S]*?children\s*=\s*\(([\s\S]*?)\);[\s\S]*?name = Frameworks;/m;
  const frameworksGroupMatch = content.match(frameworksGroupRegex);

  if (frameworksGroupMatch) {
    const frameworksGroupId = frameworksGroupMatch[1];
    const frameworksChildren = frameworksGroupMatch[2];

    // Find all PBXFileReference objects for libPods-*.a files
    // Pattern: ID /* libPods-*.a */ = {isa = PBXFileReference; ... sourceTree = BUILT_PRODUCTS_DIR; ...};
    const fileRefSectionMatch = content.match(
      /\/\* Begin PBXFileReference section \*\/\s*([\s\S]*?)\/\* End PBXFileReference section \*\//m
    );

    if (fileRefSectionMatch) {
      const fileRefSection = fileRefSectionMatch[1];
      // Match any libPods-*.a file reference
      const podsFileRefRegex =
        /(\t\t)(\w{24})(\s*\/\*\s*libPods-[^*]+\*\/\s*=\s*\{[^}]*isa\s*=\s*PBXFileReference[^}]*sourceTree\s*=\s*BUILT_PRODUCTS_DIR[^}]*\};)/g;

      // Reset regex lastIndex to ensure we find all matches
      podsFileRefRegex.lastIndex = 0;

      let podsFileRefMatch;
      const fileRefsToAdd = [];

      while (
        (podsFileRefMatch = podsFileRefRegex.exec(fileRefSection)) !== null
      ) {
        const fileRefId = podsFileRefMatch[2];
        const fullMatch = podsFileRefMatch[0];

        // Extract the file name from the comment
        const fileNameMatch = fullMatch.match(/\/\*\s*(libPods-[^*]+)\s*\*\//);
        const fileName = fileNameMatch
          ? fileNameMatch[1]
          : `libPods-${projectName}.a`;

        // Check if this file reference is already in Frameworks group
        // Use a regex to match the ID with word boundaries to avoid partial matches
        const idRegex = new RegExp(`\\b${fileRefId}\\b`);
        const inFrameworksGroup = idRegex.test(frameworksChildren);

        if (!inFrameworksGroup) {
          fileRefsToAdd.push({ id: fileRefId, name: fileName });
        }
      }

      // Add missing file references to Frameworks group
      if (fileRefsToAdd.length > 0) {
        // Re-find the Frameworks group block to get updated children list
        const updatedFrameworksGroupMatch = content.match(frameworksGroupRegex);
        if (updatedFrameworksGroupMatch) {
          const updatedFrameworksGroupId = updatedFrameworksGroupMatch[1];
          const updatedFrameworksChildren = updatedFrameworksGroupMatch[2];

          const frameworksGroupChildrenRegex = new RegExp(
            `(${updatedFrameworksGroupId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?children\\s*=\\s*\\()([\\s\\S]*?)(\\)[\\s\\S]*?name = Frameworks;)`,
            "m"
          );

          content = content.replace(
            frameworksGroupChildrenRegex,
            (match, prefix, children, suffix) => {
              const trimmedChildren = children.trim();
              const newEntries = fileRefsToAdd
                .map(ref => `\n\t\t\t\t${ref.id} /* ${ref.name} */,`)
                .join("");
              const newChildren =
                trimmedChildren === ""
                  ? `${newEntries}\n\t\t\t`
                  : `${trimmedChildren}${newEntries}\n\t\t\t`;
              return `${prefix}${newChildren}${suffix}`;
            }
          );
        }
      }
    }
  }

  // ABSOLUTE FINAL CHECK: Verify config list IDs one more time before writing
  // Use a more aggressive approach - find and replace directly
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find correct config list ID
    const correctConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (!correctConfigListMatch) {
      console.log(
        chalk.yellow(
          `⚠️  Could not find config list for ${targetName} before final write`
        )
      );
      continue;
    }

    const correctConfigListId = correctConfigListMatch[1];

    // Find target ID
    const targetIdMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\*/`
      )
    );

    if (!targetIdMatch) {
      console.log(
        chalk.yellow(
          `⚠️  Could not find target ${targetName} before final write`
        )
      );
      continue;
    }

    const targetId = targetIdMatch[1];

    // Find the target block - get everything from target ID to the closing brace
    // Use a more precise pattern that captures the entire target block
    const targetBlockPattern = new RegExp(
      `(${targetId.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*/\\*\\s*${targetName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
      "m"
    );

    const targetBlockMatch = content.match(targetBlockPattern);
    if (targetBlockMatch) {
      const currentConfigListId = targetBlockMatch[2];

      if (currentConfigListId !== correctConfigListId) {
        console.log(
          chalk.red(
            `❌ ABSOLUTE FINAL FIX: ${targetName} (${targetId}) has wrong config list ID! Expected ${correctConfigListId}, found ${currentConfigListId}. Fixing with aggressive replacement...`
          )
        );

        // AGGRESSIVE FIX: Replace using multiple strategies
        // Strategy 1: Replace the entire line with correct ID and comment
        const aggressivePattern1 = new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "m"
        );

        const beforeFix = content;
        content = content.replace(
          aggressivePattern1,
          `$1${correctConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );

        if (beforeFix === content) {
          console.log(
            chalk.yellow(
              `⚠️  Strategy 1 failed, trying Strategy 2 for ${targetName}...`
            )
          );
          // Strategy 2: Replace just the ID (more aggressive, less precise)
          const aggressivePattern2 = new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]{0,5000}?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list)`,
            "m"
          );
          content = content.replace(
            aggressivePattern2,
            `$1${correctConfigListId}$2 for PBXNativeTarget "${targetName}" */`
          );

          if (beforeFix === content) {
            console.log(
              chalk.yellow(
                `⚠️  Strategy 2 failed, trying Strategy 3 (simple ID replacement) for ${targetName}...`
              )
            );
            // Strategy 3: Simple ID replacement anywhere in target block
            const simplePattern = new RegExp(
              `(${targetId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentConfigListId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}`,
              "m"
            );
            content = content.replace(
              simplePattern,
              `$1${correctConfigListId}`
            );
          }
        }

        // Verify the fix worked
        const verifyPattern = new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
          "m"
        );
        const verifyMatch = content.match(verifyPattern);

        if (verifyMatch && verifyMatch[2] === correctConfigListId) {
          console.log(
            chalk.green(
              `✅ SUCCESS: Fixed config list ID for ${targetName} to ${correctConfigListId}`
            )
          );
        } else {
          console.log(
            chalk.red(
              `❌ FAILED: Could not fix config list ID for ${targetName}. Current: ${
                verifyMatch ? verifyMatch[2] : "not found"
              }, Expected: ${correctConfigListId}`
            )
          );
        }
      } else {
        console.log(
          chalk.green(
            `✅ Verified: ${targetName} already has correct config list ID (${correctConfigListId})`
          )
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Could not find target block pattern for ${targetName} (${targetId})`
        )
      );
    }
  }

  console.log(chalk.green("✅ iOS targets created successfully"));

  // ABSOLUTE FINAL CHECK: One more time before writing - verify and fix staging targets
  for (const env of selectedEnvs) {
    if (env.toLowerCase() === "production") continue;
    const envSuffix = env.toLowerCase();
    const targetName = `${projectName}${
      envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
    }`;

    // Find correct config list ID
    const correctConfigListMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}"\\s*\\*/`
      )
    );

    if (correctConfigListMatch) {
      const correctConfigListId = correctConfigListMatch[1];

      // Find target ID
      const targetIdMatch = content.match(
        new RegExp(
          `(\\w{24})\\s*/\\*\\s*${targetName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\s*\\*/`
        )
      );

      if (targetIdMatch) {
        const targetId = targetIdMatch[1];

        // Find current config list ID
        const currentMatch = content.match(
          new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "m"
          )
        );

        if (currentMatch && currentMatch[2] !== correctConfigListId) {
          console.log(
            chalk.red(
              `❌ FINAL FIX BEFORE WRITE: ${targetName} has wrong config list ID! Fixing...`
            )
          );
          content = content.replace(
            new RegExp(
              `(${targetId.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentMatch[2].replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
              "m"
            ),
            `$1${correctConfigListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
          );
        }
      }
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
  return buildableRefs;
}
// Helper function to read PNG dimensions
function getPngDimensions(buffer) {
  // PNG format: 8-byte signature + IHDR chunk
  // IHDR chunk: width (4 bytes) at offset 16, height (4 bytes) at offset 20
  if (buffer.length < 24) {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

// Function to update BootSplash.storyboard with splash screen image dimensions
async function updateBootSplashStoryboard(projectPath, projectName) {
  const storyboardPath = path.join(
    projectPath,
    `ios/${projectName}/BootSplash.storyboard`
  );

  if (!(await fs.pathExists(storyboardPath))) {
    return;
  }

  try {
    const splashImagePath = path.join(
      projectPath,
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset/SplashScreen.png`
    );

    // Try to read image dimensions, fallback to default if not available
    let imageWidth = 375;
    let imageHeight = 812;

    if (await fs.pathExists(splashImagePath)) {
      try {
        const imageBuffer = await fs.readFile(splashImagePath);
        const dimensions = getPngDimensions(imageBuffer);
        if (dimensions) {
          imageWidth = dimensions.width;
          imageHeight = dimensions.height;
        }
      } catch (error) {
        // If we can't read dimensions, use defaults
      }
    }

    let storyboardContent = await fs.readFile(storyboardPath, "utf8");

    // Update image resource dimensions
    storyboardContent = storyboardContent.replace(
      /(<image name="SplashScreen")\s+width="\d+"\s+height="\d+"(\/>)/,
      `$1 width="${imageWidth}" height="${imageHeight}"$2`
    );

    await fs.writeFile(storyboardPath, storyboardContent, "utf8");
  } catch (error) {
    // Silently fail - storyboard structure is already correct in template
  }
}

async function copySplashScreenImages(
  splashScreenDir,
  projectPath,
  projectName
) {
  const placeholderPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAn8B9qX+hwAAAABJRU5ErkJggg==";
  const placeholderBuffer = Buffer.from(placeholderPngBase64, "base64");

  const spinner = ora("Copying splash screen images...").start();

  try {
    // If no directory provided, write blank placeholders for both platforms
    if (!splashScreenDir) {
      // iOS blank assets
      const iosSplashPath = path.join(
        projectPath,
        `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
      );
      await fs.ensureDir(iosSplashPath);
      const iosTargets = [
        "SplashScreen.png",
        "SplashScreen@2x.png",
        "SplashScreen@3x.png",
      ];
      for (const file of iosTargets) {
        await fs.writeFile(path.join(iosSplashPath, file), placeholderBuffer);
      }

      // Android blank assets (all densities + base)
      const androidResPath = path.join(projectPath, "android/app/src/main/res");
      const androidTargets = [
        "drawable",
        "drawable-hdpi",
        "drawable-mdpi",
        "drawable-xhdpi",
        "drawable-xxhdpi",
        "drawable-xxxhdpi",
      ];
      for (const dir of androidTargets) {
        const densityPath = path.join(androidResPath, dir);
        await fs.ensureDir(densityPath);
        await fs.writeFile(
          path.join(densityPath, "splash.png"),
          placeholderBuffer
        );
      }

      spinner.succeed("Using blank default splash screens");
      // Update storyboard even for blank placeholders
      await updateBootSplashStoryboard(projectPath, projectName);
      return;
    }

    // Check if directory exists
    if (!(await fs.pathExists(splashScreenDir))) {
      spinner.warn("Splash screen directory does not exist, skipping...");
      return;
    }

    const iosSourceDir = path.join(splashScreenDir, "ios");
    const androidSourceDir = path.join(splashScreenDir, "android");

    const hasIosDir = await fs.pathExists(iosSourceDir);
    const hasAndroidDir = await fs.pathExists(androidSourceDir);

    // If ios/ and android/ subdirectories exist, use them directly (like appicon.co structure)
    if (hasIosDir || hasAndroidDir) {
      // Copy iOS images from ios/ subdirectory
      if (hasIosDir) {
        const iosSplashPath = path.join(
          projectPath,
          `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
        );

        if (await fs.pathExists(iosSplashPath)) {
          const iosFiles = await fs.readdir(iosSourceDir);
          const iosImageFiles = [];

          // Collect all image files
          for (const file of iosFiles) {
            const filePath = path.join(iosSourceDir, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
              iosImageFiles.push(file);
            }
          }

          // Determine which file is which scale based on filename
          let ios1x = null;
          let ios2x = null;
          let ios3x = null;

          for (const file of iosImageFiles) {
            const lowerFile = file.toLowerCase();
            if (/@3x|3x/i.test(file)) {
              ios3x = file;
            } else if (/@2x|2x/i.test(file)) {
              ios2x = file;
            } else {
              // Default to 1x if no scale indicator
              if (!ios1x) ios1x = file;
            }
          }

          // If we only have one file, use it for all scales
          if (iosImageFiles.length === 1) {
            ios1x = ios2x = ios3x = iosImageFiles[0];
          }

          // Copy and rename files to standard names (always use .png for iOS)
          if (ios1x) {
            await fs.copy(
              path.join(iosSourceDir, ios1x),
              path.join(iosSplashPath, "SplashScreen.png")
            );
          }
          if (ios2x) {
            await fs.copy(
              path.join(iosSourceDir, ios2x),
              path.join(iosSplashPath, "SplashScreen@2x.png")
            );
          }
          if (ios3x) {
            await fs.copy(
              path.join(iosSourceDir, ios3x),
              path.join(iosSplashPath, "SplashScreen@3x.png")
            );
          }

          // Update BootSplash.storyboard after copying iOS images
          await updateBootSplashStoryboard(projectPath, projectName);
        }
      }

      // Copy Android images from android/ subdirectory
      if (hasAndroidDir) {
        const androidResPath = path.join(
          projectPath,
          "android/app/src/main/res"
        );

        if (await fs.pathExists(androidResPath)) {
          // Look for drawable-* directories in android source
          const androidFiles = await fs.readdir(androidSourceDir);
          for (const item of androidFiles) {
            const itemPath = path.join(androidSourceDir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory() && item.startsWith("drawable-")) {
              // Copy all files from drawable-* directory and rename to splash.png
              const densityPath = path.join(androidResPath, item);
              await fs.ensureDir(densityPath);

              const densityFiles = await fs.readdir(itemPath);
              // Find first image file (or use all if multiple)
              for (const file of densityFiles) {
                const filePath = path.join(itemPath, file);
                const fileStat = await fs.stat(filePath);
                if (fileStat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
                  // Always rename to splash.png (Android expects PNG format)
                  await fs.copy(filePath, path.join(densityPath, "splash.png"));
                  // Only copy first file per density
                  break;
                }
              }
            } else if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(item)) {
              // If there are files directly in android/ directory, try to map them
              // This is a fallback for flat structure
              const androidBase = item;
              const densities = [
                "drawable-hdpi",
                "drawable-mdpi",
                "drawable-xhdpi",
                "drawable-xxhdpi",
                "drawable-xxxhdpi",
              ];

              for (const density of densities) {
                const densityPath = path.join(androidResPath, density);
                await fs.ensureDir(densityPath);
                await fs.copy(itemPath, path.join(densityPath, "splash.png"));
              }
            }
          }
        }
      }

      spinner.succeed("Splash screen images copied");
      return;
    }

    // Fallback: old logic - search for files by name patterns
    const files = await fs.readdir(splashScreenDir);
    const imageFiles = [];
    for (const file of files) {
      const filePath = path.join(splashScreenDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) {
      spinner.warn(
        "No image files found in splash screen directory, skipping..."
      );
      return;
    }

    // Find splash screen images
    // Look for files with patterns like: splash.png, splash@2x.png, splash@3x.png
    // or any files with @2x, @3x in name, or splash-hdpi.png, splash-mdpi.png, etc.
    const findImage = pattern => {
      return imageFiles.find(file => new RegExp(pattern, "i").test(file));
    };

    // For iOS: look for files with @2x, @3x in name, or splash.png, or use first file for all
    let ios1x = null;
    let ios2x = null;
    let ios3x = null;

    // First, try to find files by scale indicators
    for (const file of imageFiles) {
      if (/@3x|3x/i.test(file)) {
        ios3x = file;
      } else if (/@2x|2x/i.test(file)) {
        ios2x = file;
      } else if (!ios1x && /@1x|^splash/i.test(file)) {
        ios1x = file;
      }
    }

    // Fallback: use splash.png patterns
    if (!ios1x) {
      ios1x =
        findImage("^splash(@1x)?\\.(png|jpg|jpeg)$") ||
        findImage("^splash\\.(png|jpg|jpeg)$");
    }
    if (!ios2x) {
      ios2x = findImage("^splash@2x\\.(png|jpg|jpeg)$") || ios1x;
    }
    if (!ios3x) {
      ios3x = findImage("^splash@3x\\.(png|jpg|jpeg)$") || ios1x;
    }

    // If still no files found, use first available file for all scales
    if (!ios1x && imageFiles.length > 0) {
      ios1x = ios2x = ios3x = imageFiles[0];
    }

    // For Android: look for density-specific files or use splash.png for all
    const androidBase = findImage("^splash\\.png$");
    const androidHdpi = findImage("^splash-hdpi\\.png$") || androidBase;
    const androidMdpi = findImage("^splash-mdpi\\.png$") || androidBase;
    const androidXhdpi = findImage("^splash-xhdpi\\.png$") || androidBase;
    const androidXxhdpi = findImage("^splash-xxhdpi\\.png$") || androidBase;
    const androidXxxhdpi = findImage("^splash-xxxhdpi\\.png$") || androidBase;

    // Copy iOS images
    const iosSplashPath = path.join(
      projectPath,
      `ios/${projectName}/Images.xcassets/SplashScreen.imageset`
    );

    if (await fs.pathExists(iosSplashPath)) {
      if (ios1x) {
        await fs.copy(
          path.join(splashScreenDir, ios1x),
          path.join(iosSplashPath, "SplashScreen.png")
        );
      }
      if (ios2x) {
        await fs.copy(
          path.join(splashScreenDir, ios2x),
          path.join(iosSplashPath, "SplashScreen@2x.png")
        );
      }
      if (ios3x) {
        await fs.copy(
          path.join(splashScreenDir, ios3x),
          path.join(iosSplashPath, "SplashScreen@3x.png")
        );
      }

      // Update BootSplash.storyboard after copying iOS images
      await updateBootSplashStoryboard(projectPath, projectName);
    }

    // Copy Android images
    const androidResPath = path.join(projectPath, "android/app/src/main/res");

    if (await fs.pathExists(androidResPath)) {
      const densities = [
        { name: "drawable-hdpi", file: androidHdpi },
        { name: "drawable-mdpi", file: androidMdpi },
        { name: "drawable-xhdpi", file: androidXhdpi },
        { name: "drawable-xxhdpi", file: androidXxhdpi },
        { name: "drawable-xxxhdpi", file: androidXxxhdpi },
      ];

      for (const density of densities) {
        if (density.file) {
          const densityPath = path.join(androidResPath, density.name);
          await fs.ensureDir(densityPath);
          await fs.copy(
            path.join(splashScreenDir, density.file),
            path.join(densityPath, "splash.png")
          );
        }
      }
    }

    spinner.succeed("Splash screen images copied");
  } catch (error) {
    spinner.fail("Failed to copy splash screen images");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

async function copyAppIcons(appIconDir, projectPath, projectName) {
  if (!appIconDir) {
    return; // Use default icons if no directory provided
  }

  const spinner = ora("Copying app icons...").start();

  try {
    // Check if directory exists
    if (!(await fs.pathExists(appIconDir))) {
      spinner.warn("App icon directory does not exist, skipping...");
      return;
    }

    const androidSourceDir = path.join(appIconDir, "android");
    const iosSourceDir = path.join(
      appIconDir,
      "Assets.xcassets",
      "AppIcon.appiconset"
    );

    const hasAndroidDir = await fs.pathExists(androidSourceDir);
    const hasIosDir = await fs.pathExists(iosSourceDir);

    // Copy Android icons from android/ subdirectory
    if (hasAndroidDir) {
      const androidResPath = path.join(projectPath, "android/app/src/main/res");

      if (await fs.pathExists(androidResPath)) {
        const densities = [
          "mipmap-hdpi",
          "mipmap-mdpi",
          "mipmap-xhdpi",
          "mipmap-xxhdpi",
          "mipmap-xxxhdpi",
        ];

        for (const density of densities) {
          const sourceDensityPath = path.join(androidSourceDir, density);
          const targetDensityPath = path.join(androidResPath, density);

          if (await fs.pathExists(sourceDensityPath)) {
            await fs.ensureDir(targetDensityPath);

            // Copy ic_launcher.png and ic_launcher_round.png
            const iconFiles = ["ic_launcher.png", "ic_launcher_round.png"];
            for (const iconFile of iconFiles) {
              const sourceFile = path.join(sourceDensityPath, iconFile);
              const targetFile = path.join(targetDensityPath, iconFile);

              if (await fs.pathExists(sourceFile)) {
                await fs.copy(sourceFile, targetFile);
              }
            }
          }
        }
      }
    }

    // Copy iOS icons from Assets.xcassets/AppIcon.appiconset/
    if (hasIosDir) {
      const iosTargetPath = path.join(
        projectPath,
        `ios/${projectName}/Images.xcassets/AppIcon.appiconset`
      );

      if (await fs.pathExists(path.dirname(iosTargetPath))) {
        await fs.ensureDir(iosTargetPath);

        // Copy all PNG files from source
        const sourceFiles = await fs.readdir(iosSourceDir);
        for (const file of sourceFiles) {
          const sourceFilePath = path.join(iosSourceDir, file);
          const stat = await fs.stat(sourceFilePath);

          if (stat.isFile() && /\.(png|PNG)$/.test(file)) {
            const targetFilePath = path.join(iosTargetPath, file);
            await fs.copy(sourceFilePath, targetFilePath);
          }
        }

        // Copy Contents.json if it exists
        const contentsJsonSource = path.join(iosSourceDir, "Contents.json");
        const contentsJsonTarget = path.join(iosTargetPath, "Contents.json");
        if (await fs.pathExists(contentsJsonSource)) {
          await fs.copy(contentsJsonSource, contentsJsonTarget);
        }
      }
    }

    // Fallback: if structure is flat, try to find icons in root
    if (!hasAndroidDir && !hasIosDir) {
      const files = await fs.readdir(appIconDir);
      const imageFiles = files.filter(file => /\.(png|PNG)$/.test(file));

      if (imageFiles.length > 0) {
        spinner.warn(
          "Found icon files but expected android/ and Assets.xcassets/AppIcon.appiconset/ structure. Skipping..."
        );
      }
    }

    spinner.succeed("App icons copied");
  } catch (error) {
    spinner.fail("Failed to copy app icons");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

async function calculateFileSha1(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash("sha1");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

async function updateLinkAssetsManifest(projectPath, fontFiles) {
  const manifestPathAndroid = path.join(
    projectPath,
    "android",
    "link-assets-manifest.json"
  );
  const manifestPathIos = path.join(
    projectPath,
    "ios",
    "link-assets-manifest.json"
  );

  const manifestData = {
    migIndex: 1,
    data: [],
  };

  // Calculate sha1 for each font file and add to manifest
  for (const fontFile of fontFiles) {
    const fontPath = path.join(projectPath, "assets", "fonts", fontFile);
    if (await fs.pathExists(fontPath)) {
      const sha1 = await calculateFileSha1(fontPath);
      manifestData.data.push({
        path: `assets/fonts/${fontFile}`,
        sha1: sha1,
      });
    }
  }

  // Write to both Android and iOS manifest files
  await fs.writeFile(
    manifestPathAndroid,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(
    manifestPathIos,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf8"
  );
}

function generateUuid() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  ).toUpperCase();
}

async function addFontsToInfoPlistForPath(infoPlistPath, fontFiles) {
  if (!(await fs.pathExists(infoPlistPath))) {
    return;
  }

  let content = await fs.readFile(infoPlistPath, "utf8");

  // Check if UIAppFonts already exists
  const hasUIAppFonts = content.includes("<key>UIAppFonts</key>");

  if (!hasUIAppFonts) {
    // Add UIAppFonts array before closing </dict>
    const fontStrings = fontFiles
      .map(font => `\t\t<string>${font}</string>`)
      .join("\n");
    const uiAppFontsSection = `\t<key>UIAppFonts</key>
\t<array>
${fontStrings}
\t</array>`;

    content = content.replace(
      /(\t<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>)/,
      `$1\n${uiAppFontsSection}`
    );

    await fs.writeFile(infoPlistPath, content, "utf8");
  } else {
    // Update existing UIAppFonts array - find the array and add missing fonts
    const arrayStart = content.indexOf("<key>UIAppFonts</key>");
    if (arrayStart !== -1) {
      const arrayContentStart = content.indexOf("<array>", arrayStart);
      const arrayEnd = content.indexOf("</array>", arrayStart);
      if (arrayContentStart !== -1 && arrayEnd !== -1) {
        const existingArrayContent = content.substring(
          arrayContentStart + 7,
          arrayEnd
        );
        const existingFonts = (
          existingArrayContent.match(/<string>([^<]+)<\/string>/g) || []
        ).map(match => match.replace(/<string>|<\/string>/g, "").trim());

        const missingFonts = fontFiles.filter(
          font => !existingFonts.includes(font)
        );

        if (missingFonts.length > 0) {
          const newFontStrings = missingFonts
            .map(font => `\t\t<string>${font}</string>`)
            .join("\n");
          content =
            content.substring(0, arrayEnd) +
            "\n" +
            newFontStrings +
            "\n\t" +
            content.substring(arrayEnd);
          await fs.writeFile(infoPlistPath, content, "utf8");
        }
      }
    }
  }
}

async function addFontsToInfoPlist(projectPath, projectName, fontFiles) {
  const infoPlistPath = path.join(projectPath, `ios/${projectName}/Info.plist`);
  await addFontsToInfoPlistForPath(infoPlistPath, fontFiles);
}

async function addInfoPlistsToXcodeProject(
  projectPath,
  projectName,
  envInfoPlists,
  pbxprojPath
) {
  if (!envInfoPlists || envInfoPlists.length === 0) {
    return;
  }

  if (!(await fs.pathExists(pbxprojPath))) {
    return;
  }

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Check which Info.plist files are already added
  const existingPlists = new Set();
  const plistRegex = /\/\* ([^\s]+-Info\.plist) \*\//gi;
  let match;
  while ((match = plistRegex.exec(content)) !== null) {
    existingPlists.add(match[1]);
  }

  // Filter out plists that are already in the project
  const plistsToAdd = envInfoPlists.filter(
    ({ fileName }) => !existingPlists.has(fileName)
  );

  if (plistsToAdd.length === 0) {
    return; // All plists already added
  }

  // Generate UUIDs for each new Info.plist file
  const plistRefs = {};
  for (const { env, path: plistPath, fileName } of plistsToAdd) {
    const fileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    plistRefs[env] = { fileRef, plistFileName: fileName, plistPath };
  }

  // Add PBXFileReference entries
  const fileRefSection = `/* Begin PBXFileReference section */`;
  const fileRefIndex = content.indexOf(fileRefSection);
  if (fileRefIndex !== -1) {
    const fileRefEnd = content.indexOf("/* End PBXFileReference section */");
    if (fileRefEnd !== -1) {
      const fileRefEntries = Object.entries(plistRefs)
        .map(
          ([env, refs]) =>
            `\t\t${refs.fileRef} /* ${refs.plistFileName} */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; name = "${refs.plistFileName}"; path = "${projectName}/${refs.plistFileName}"; sourceTree = "<group>"; };`
        )
        .join("\n");

      content =
        content.substring(0, fileRefEnd) +
        "\n" +
        fileRefEntries +
        "\n" +
        content.substring(fileRefEnd);
    }
  }

  // Add to project group (13B07FAE1A68108700A75B9A is the fixed ID for the main project group)
  // Find the PBXGroup section for the project folder
  const projectGroupRegex = new RegExp(
    `13B07FAE1A68108700A75B9A /\\* .*? \\*/ = \\{[\\s\\S]*?children = \\(([\\s\\S]*?)\\);`,
    "m"
  );
  const projectGroupMatch = content.match(projectGroupRegex);
  if (projectGroupMatch) {
    const matchIndex = projectGroupMatch.index;
    const fullMatch = projectGroupMatch[0];
    const childrenContent = projectGroupMatch[1];
    const childrenStartPos =
      matchIndex + fullMatch.indexOf("children = (") + 12;
    const childrenEndPos = childrenStartPos + childrenContent.length;

    const childrenEntries = Object.entries(plistRefs)
      .map(
        ([env, refs]) => `\t\t\t\t${refs.fileRef} /* ${refs.plistFileName} */,`
      )
      .join("\n");

    content =
      content.substring(0, childrenEndPos) +
      "\n" +
      childrenEntries +
      "\n" +
      content.substring(childrenEndPos);
  }

  // CRITICAL: Before writing, verify staging targets still have correct config list IDs
  // This function runs AFTER createIosTargetsForEnvs, so we need to ensure nothing broke
  // Find all environment targets (targets with names like "{projectName}Staging", "{projectName}Dev", etc.)
  // by searching for config lists with environment target names
  const envTargetPattern = new RegExp(
    `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${projectName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}([^"]+)"\\s*\\*/`,
    "g"
  );

  let envMatch;
  while ((envMatch = envTargetPattern.exec(content)) !== null) {
    const configListId = envMatch[1];
    const envSuffix = envMatch[2];
    const targetName = `${projectName}${envSuffix}`;

    // Skip if it's the base target (no suffix)
    if (!envSuffix || envSuffix.trim() === "") continue;

    // Find target ID
    const targetIdMatch = content.match(
      new RegExp(
        `(\\w{24})\\s*/\\*\\s*${targetName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\*/`
      )
    );

    if (targetIdMatch) {
      const targetId = targetIdMatch[1];

      // Find current config list ID in target
      const currentMatch = content.match(
        new RegExp(
          `(${targetId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "([^"]*)"\\s*\\*/)`,
          "m"
        )
      );

      if (
        currentMatch &&
        (currentMatch[2] !== configListId || currentMatch[4] !== targetName)
      ) {
        console.log(
          chalk.red(
            `❌ AFTER INFO PLISTS: ${targetName} has wrong config! Expected ID: ${configListId}, Comment: ${targetName}. Found ID: ${currentMatch[2]}, Comment: ${currentMatch[4]}. Fixing...`
          )
        );
        content = content.replace(
          new RegExp(
            `(${targetId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}[\\s\\S]*?buildConfigurationList\\s*=\\s*)${currentMatch[2].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "[^"]*"\\s*\\*/)`,
            "m"
          ),
          `$1${configListId} /* Build configuration list for PBXNativeTarget "${targetName}" */`
        );
        console.log(
          chalk.green(
            `✅ Fixed config list ID for ${targetName} after Info.plists update`
          )
        );
      }
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
}

async function addFontsToXcodeProject(projectPath, projectName, fontFiles) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!(await fs.pathExists(pbxprojPath))) {
    return;
  }

  let content = await fs.readFile(pbxprojPath, "utf8");

  // Check which fonts are already added
  const existingFonts = new Set();
  const fontRegex = /\/\* ([^\s]+\.(ttf|otf|ttc|woff|woff2)) \*\//gi;
  let match;
  while ((match = fontRegex.exec(content)) !== null) {
    existingFonts.add(match[1]);
  }

  // Filter out fonts that are already in the project
  const fontsToAdd = fontFiles.filter(font => !existingFonts.has(font));

  if (fontsToAdd.length === 0) {
    return; // All fonts already added
  }

  // Generate UUIDs for each new font file (24 char hex)
  const fontRefs = {};
  for (const fontFile of fontsToAdd) {
    // Generate 24 character hex UUID
    const fileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    const buildFileRef = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join("")
      .toUpperCase();
    fontRefs[fontFile] = { fileRef, buildFileRef };
  }

  // Add PBXFileReference entries
  const fileRefSection = `/* Begin PBXFileReference section */`;
  const fileRefIndex = content.indexOf(fileRefSection);
  if (fileRefIndex !== -1) {
    const fileRefEnd = content.indexOf("/* End PBXFileReference section */");
    if (fileRefEnd !== -1) {
      const fileRefEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t${refs.fileRef} /* ${fontFile} */ = {isa = PBXFileReference; explicitFileType = undefined; fileEncoding = 9; includeInIndex = 0; lastKnownFileType = unknown; name = "${fontFile}"; path = "../assets/fonts/${fontFile}"; sourceTree = "<group>"; };`
        )
        .join("\n");

      content =
        content.substring(0, fileRefEnd) +
        "\n" +
        fileRefEntries +
        "\n" +
        content.substring(fileRefEnd);
    }
  }

  // Add PBXBuildFile entries
  const buildFileSection = `/* Begin PBXBuildFile section */`;
  const buildFileIndex = content.indexOf(buildFileSection);
  if (buildFileIndex !== -1) {
    const buildFileEnd = content.indexOf("/* End PBXBuildFile section */");
    if (buildFileEnd !== -1) {
      const buildFileEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t${refs.buildFileRef} /* ${fontFile} in Resources */ = {isa = PBXBuildFile; fileRef = ${refs.fileRef} /* ${fontFile} */; };`
        )
        .join("\n");

      content =
        content.substring(0, buildFileEnd) +
        "\n" +
        buildFileEntries +
        "\n" +
        content.substring(buildFileEnd);
    }
  }

  // Add to Resources group
  const resourcesGroupStart = content.indexOf(
    `0A994B0844B5445E81562B86 /* Resources */ = {`
  );
  if (resourcesGroupStart !== -1) {
    const resourcesGroupChildrenStart = content.indexOf(
      "children = (",
      resourcesGroupStart
    );
    const resourcesGroupChildrenEnd = content.indexOf(
      ");",
      resourcesGroupChildrenStart
    );
    if (
      resourcesGroupChildrenStart !== -1 &&
      resourcesGroupChildrenEnd !== -1
    ) {
      const childrenEntries = Object.entries(fontRefs)
        .map(([fontFile, refs]) => `\t\t\t\t${refs.fileRef} /* ${fontFile} */,`)
        .join("\n");

      content =
        content.substring(0, resourcesGroupChildrenEnd) +
        "\n" +
        childrenEntries +
        "\n" +
        content.substring(resourcesGroupChildrenEnd);
    }
  }

  // Add to PBXResourcesBuildPhase
  const resourcesBuildPhaseStart = content.indexOf(
    `13B07F8E1A680F5B00A75B9A /* Resources */ = {`
  );
  if (resourcesBuildPhaseStart !== -1) {
    const resourcesBuildPhaseFilesStart = content.indexOf(
      "files = (",
      resourcesBuildPhaseStart
    );
    const resourcesBuildPhaseFilesEnd = content.indexOf(
      ");",
      resourcesBuildPhaseFilesStart
    );
    if (
      resourcesBuildPhaseFilesStart !== -1 &&
      resourcesBuildPhaseFilesEnd !== -1
    ) {
      const filesEntries = Object.entries(fontRefs)
        .map(
          ([fontFile, refs]) =>
            `\t\t\t\t${refs.buildFileRef} /* ${fontFile} in Resources */,`
        )
        .join("\n");

      content =
        content.substring(0, resourcesBuildPhaseFilesEnd) +
        "\n" +
        filesEntries +
        "\n" +
        content.substring(resourcesBuildPhaseFilesEnd);
    }
  }

  await fs.writeFile(pbxprojPath, content, "utf8");
}

async function copyFonts(fontsDir, projectPath, projectName) {
  if (!fontsDir) {
    return; // Skip if no fonts directory provided
  }

  const spinner = ora("Copying and linking fonts...").start();

  try {
    // Check if directory exists
    if (!(await fs.pathExists(fontsDir))) {
      spinner.warn("Fonts directory does not exist, skipping...");
      return;
    }

    // Ensure assets/fonts directory exists in project
    const targetFontsDir = path.join(projectPath, "assets", "fonts");
    await fs.ensureDir(targetFontsDir);

    // Ensure android/app/src/main/assets/fonts directory exists
    const androidFontsDir = path.join(
      projectPath,
      "android/app/src/main/assets/fonts"
    );
    await fs.ensureDir(androidFontsDir);

    // Read all files from source directory
    const files = await fs.readdir(fontsDir);

    // Filter only font files (ttf, otf, ttc)
    const fontFiles = files.filter(file =>
      /\.(ttf|otf|ttc|woff|woff2)$/i.test(file)
    );

    if (fontFiles.length === 0) {
      spinner.warn("No font files found in fonts directory, skipping...");
      return;
    }

    // Copy all font files to assets/fonts
    for (const fontFile of fontFiles) {
      const sourceFile = path.join(fontsDir, fontFile);
      const targetFile = path.join(targetFontsDir, fontFile);
      await fs.copy(sourceFile, targetFile);

      // Also copy to android/app/src/main/assets/fonts
      const androidTargetFile = path.join(androidFontsDir, fontFile);
      await fs.copy(sourceFile, androidTargetFile);
    }

    spinner.succeed(`Copied ${fontFiles.length} font file(s)`);

    // Update link-assets-manifest.json files
    spinner.start("Updating link-assets-manifest.json files...");
    try {
      await updateLinkAssetsManifest(projectPath, fontFiles);
      spinner.succeed("Updated link-assets-manifest.json files");
    } catch (error) {
      spinner.warn("Failed to update link-assets-manifest.json files");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update Info.plist with UIAppFonts
    spinner.start("Updating Info.plist...");
    try {
      await addFontsToInfoPlist(projectPath, projectName, fontFiles);
      spinner.succeed("Updated Info.plist");
    } catch (error) {
      spinner.warn("Failed to update Info.plist");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update Xcode project.pbxproj
    spinner.start("Updating Xcode project...");
    try {
      await addFontsToXcodeProject(projectPath, projectName, fontFiles);
      spinner.succeed("Updated Xcode project");
    } catch (error) {
      spinner.warn("Failed to update Xcode project");
      console.log(chalk.yellow(`Warning: ${error.message}`));
    }

    // Update react-native.config.js to include fonts
    const configPath = path.join(projectPath, "react-native.config.js");
    if (await fs.pathExists(configPath)) {
      try {
        let configContent = await fs.readFile(configPath, "utf8");

        // Check if assets already exists
        if (!configContent.includes('assets: ["./assets/fonts"]')) {
          // Add assets array before the closing brace of module.exports
          // Find the last closing brace of the main object and add assets before it
          const lines = configContent.split("\n");
          let lastBraceIndex = -1;

          // Find the last closing brace that's not part of nested objects
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === "}") {
              lastBraceIndex = i;
              break;
            }
          }

          if (lastBraceIndex > 0) {
            // Get the indentation from the line before the closing brace
            const indentMatch = lines[lastBraceIndex - 1].match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : "  ";

            // Insert assets line before the closing brace
            lines.splice(
              lastBraceIndex,
              0,
              `${indent}assets: ["./assets/fonts"],`
            );

            configContent = lines.join("\n");
            await fs.writeFile(configPath, configContent, "utf8");
          }
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            `Warning: Failed to update react-native.config.js: ${error.message}`
          )
        );
      }
    }
  } catch (error) {
    spinner.fail("Failed to copy fonts");
    console.log(chalk.yellow(`Warning: ${error.message}`));
  }
}

async function createEnvFiles(selectedEnvs, projectPath) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  // Always create production .env file
  const allEnvs = [...selectedEnvs];
  if (!allEnvs.some(env => env.toLowerCase() === "production")) {
    allEnvs.push("production");
  }

  for (const env of allEnvs) {
    // Create .env files in the root of the project (not in android/ios folders)
    const envFile = path.join(projectPath, `.env.${env.toLowerCase()}`);
    // Create empty .env file if it doesn't exist
    if (!(await fs.pathExists(envFile))) {
      await fs.writeFile(
        envFile,
        `# ${env.toUpperCase()} environment variables\n`,
        "utf8"
      );
      console.log(chalk.green(`  ✅ Created ${path.basename(envFile)}`));
    }
  }
}

async function addScriptsToPackageJson(
  selectedEnvs,
  projectPath,
  projectName,
  bundleIdentifier
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const packageJsonPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) return;

  let packageJson = await fs.readFile(packageJsonPath, "utf8");
  let packageData;
  try {
    packageData = JSON.parse(packageJson);
  } catch (error) {
    console.log(
      chalk.yellow(`⚠️  Could not parse package.json: ${error.message}`)
    );
    return;
  }

  if (!packageData.scripts) {
    packageData.scripts = {};
  }

  // Always include production for Android
  const allEnvs = [...selectedEnvs];
  if (!allEnvs.some(env => env.toLowerCase() === "production")) {
    allEnvs.push("production");
  }

  const lowerProjectName = projectName.toLowerCase();
  const capProjectName =
    projectName.charAt(0).toUpperCase() + projectName.slice(1);

  // Add Android scripts
  for (const env of allEnvs) {
    const lowerEnv = env.toLowerCase();
    const capEnv = env.charAt(0).toUpperCase() + env.slice(1);
    const scriptEnv = lowerEnv;

    // Debug scripts
    if (lowerEnv === "production") {
      packageData.scripts[
        `android:prod`
      ] = `react-native run-android --mode=productiondebug --appId=${bundleIdentifier}`;
      packageData.scripts[
        `android:prod-release`
      ] = `react-native run-android --mode=productionrelease`;
      packageData.scripts[
        `android:build-prod`
      ] = `cd android && ./gradlew app:assembleProductionRelease && cd ..`;
      packageData.scripts[
        `android:bundle`
      ] = `cd android && ./gradlew clean && ./gradlew bundleProductionRelease && cd ..`;
    } else {
      packageData.scripts[
        `android:${scriptEnv}`
      ] = `react-native run-android --mode=${lowerEnv}debug --appId=${bundleIdentifier}`;
      packageData.scripts[
        `android:${scriptEnv}-release`
      ] = `react-native run-android --mode=${lowerEnv}release`;
      packageData.scripts[
        `android:build-${scriptEnv}`
      ] = `cd android && ./gradlew app:assemble${capEnv}Release && cd ..`;
    }
  }

  // Add general build script if development exists
  if (allEnvs.some(env => env.toLowerCase() === "development")) {
    packageData.scripts[
      `android:build`
    ] = `cd android && ./gradlew app:assembleDevelopmentRelease && cd ..`;
  }

  // Add iOS scripts
  const envsForIos = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );
  for (const env of envsForIos) {
    const lowerEnv = env.toLowerCase();
    const scriptEnv = lowerEnv;
    const schemeName = `${projectName}${getEnvNameForScheme(env)}`;
    packageData.scripts[
      `ios:${scriptEnv}`
    ] = `react-native run-ios --scheme '${schemeName}'`;
  }

  // Always add production iOS script
  packageData.scripts[
    `ios:prod`
  ] = `react-native run-ios --scheme '${projectName}'`;

  // Write updated package.json
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageData, null, 2) + "\n",
    "utf8"
  );
}

async function createApp(config) {
  const {
    projectName,
    projectPath,
    bundleIdentifier,
    displayName,
    packageManager,
    skipInstall,
    skipGit,
    skipPods,
    autoYes,
    splashScreenDir,
    appIconDir,
    fontsDir,
    envSetupSelectedEnvs = [],
    firebase = {},
    maps = {},
    zustandStorage = false,
    navigationMode = "none",
    localization = {},
  } = config;

  const templatePath = path.join(__dirname, "../template");
  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const firebaseFilesByEnv = getGoogleFilesByEnv(firebase?.googleFiles);
  const mapsEnabled = maps?.enabled || false;
  const mapsProvider = maps?.provider || null;
  const googleMapsApiKey = maps?.googleMapsApiKey || null;
  const enableGoogleMaps = mapsProvider === "google-maps";
  const localizationEnabled = localization?.enabled || false;
  const localizationDefaultLanguage = localization?.defaultLanguage || "ru";
  const localizationWithRemoteConfig = localization?.withRemoteConfig || false;

  // Step 1: Copy template
  const copySpinner = ora("Copying template files...").start();
  try {
    await fs.ensureDir(projectPath);
    await fs.copy(templatePath, projectPath, {
      filter: src => {
        // Skip node_modules, build folders, etc.
        const relativePath = path.relative(templatePath, src);
        const normalizedPath = relativePath.replace(/\\/g, "/");

        // Skip node_modules, .git, Pods
        if (
          normalizedPath.includes("node_modules") ||
          normalizedPath.includes(".git") ||
          normalizedPath.includes("Pods")
        ) {
          return false;
        }

        // Skip build directories (but allow build.gradle files)
        // Pattern: /build/ or /build at end (directory), but not build.gradle (file)
        const buildDirPattern = /\/build(\/|$)/;
        if (buildDirPattern.test(normalizedPath)) {
          // This is a build directory, skip it
          return false;
        }

        // Allow build.gradle files
        if (normalizedPath.endsWith("build.gradle")) {
          return true;
        }

        return true;
      },
    });

    // Rename _gitignore to .gitignore
    const gitignorePath = path.join(projectPath, "_gitignore");
    if (await fs.pathExists(gitignorePath)) {
      await fs.move(gitignorePath, path.join(projectPath, ".gitignore"));
    }

    copySpinner.succeed("Template files copied");
  } catch (error) {
    copySpinner.fail("Failed to copy template files");
    throw error;
  }

  // Step 2: Replace placeholders
  const replaceSpinner = ora("Replacing placeholders...").start();
  try {
    const replacements = {
      HelloWorld: projectName,
      helloworld: projectName.toLowerCase(),
      "com.helloworld": bundleIdentifier,
      "Hello World": displayName,
    };

    // Files to replace (excluding MainActivity.kt, MainApplication.kt, and build.gradle - they will be handled separately)
    const filesToReplace = [
      "package.json",
      "app.json",
      "index.js",
      "android/settings.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "ios/Podfile",
      "ios/HelloWorld/Info.plist",
      "ios/HelloWorld/AppDelegate.swift",
      "ios/HelloWorld.xcodeproj/project.pbxproj",
      "ios/HelloWorld.xcworkspace/contents.xcworkspacedata",
    ];

    for (const file of filesToReplace) {
      const filePath = path.join(projectPath, file);
      if (await fs.pathExists(filePath)) {
        await replaceInFile(filePath, replacements);
      }
    }

    // Special handling for app.json to ensure displayName is set correctly
    const appJsonPath = path.join(projectPath, "app.json");
    if (await fs.pathExists(appJsonPath)) {
      let appJsonContent = await fs.readFile(appJsonPath, "utf8");
      try {
        const appJson = JSON.parse(appJsonContent);
        // Ensure displayName is set correctly
        if (appJson.displayName !== displayName) {
          appJson.displayName = displayName;
          appJsonContent = JSON.stringify(appJson, null, 2);
          await fs.writeFile(appJsonPath, appJsonContent, "utf8");
        }
      } catch (error) {
        // If JSON parsing fails, the replaceInFile should have handled it
        console.log(
          chalk.yellow(`Warning: Could not parse app.json: ${error.message}`)
        );
      }
    }

    // Ensure package attribute on AndroidManifest.xml
    const androidManifestPath = path.join(
      projectPath,
      "android/app/src/main/AndroidManifest.xml"
    );
    // Note: We don't add package attribute to AndroidManifest.xml as it causes errors
    // The package is determined by the namespace in build.gradle

    // Process build.gradle separately with replacements
    const buildGradlePath = path.join(projectPath, "android/app/build.gradle");
    if (await fs.pathExists(buildGradlePath)) {
      await replaceInFile(buildGradlePath, replacements);

      // Then force correct namespace and applicationId (after all replacements)
      let buildGradleContent = await fs.readFile(buildGradlePath, "utf8");
      // Force correct namespace - replace any namespace with correct one
      buildGradleContent = buildGradleContent.replace(
        /namespace\s+"[^"]+"/g,
        `namespace "${bundleIdentifier}"`
      );
      // Force correct applicationId in defaultConfig
      // Find defaultConfig block and replace applicationId inside it
      const defaultConfigRegex = /(defaultConfig\s*\{)([\s\S]*?)(\})/;
      const defaultConfigMatch = buildGradleContent.match(defaultConfigRegex);
      if (defaultConfigMatch) {
        let defaultConfigContent = defaultConfigMatch[2];
        // Replace applicationId in defaultConfig block
        defaultConfigContent = defaultConfigContent.replace(
          /applicationId\s+"[^"]+"/,
          `applicationId "${bundleIdentifier}"`
        );
        // Reconstruct the defaultConfig block
        buildGradleContent = buildGradleContent.replace(
          defaultConfigRegex,
          `${defaultConfigMatch[1]}${defaultConfigContent}${defaultConfigMatch[3]}`
        );
      }
      await fs.writeFile(buildGradlePath, buildGradleContent, "utf8");
    }

    // Rename iOS folder
    const iosOldPath = path.join(projectPath, "ios/HelloWorld");
    const iosNewPath = path.join(projectPath, `ios/${projectName}`);
    if (await fs.pathExists(iosOldPath)) {
      await fs.move(iosOldPath, iosNewPath);
    }

    // Rename iOS xcodeproj
    const xcodeprojOldPath = path.join(projectPath, "ios/HelloWorld.xcodeproj");
    const xcodeprojNewPath = path.join(
      projectPath,
      `ios/${projectName}.xcodeproj`
    );
    if (await fs.pathExists(xcodeprojOldPath)) {
      await fs.move(xcodeprojOldPath, xcodeprojNewPath);
    }

    // Rename iOS xcworkspace
    const xcworkspaceOldPath = path.join(
      projectPath,
      "ios/HelloWorld.xcworkspace"
    );
    const xcworkspaceNewPath = path.join(
      projectPath,
      `ios/${projectName}.xcworkspace`
    );
    if (await fs.pathExists(xcworkspaceOldPath)) {
      await fs.move(xcworkspaceOldPath, xcworkspaceNewPath);
    }

    // Rename Android package directories (ensure correct nesting for multi-part IDs)
    const javaSrcPath = path.join(projectPath, "android/app/src/main/java");
    const androidOldPath = path.join(javaSrcPath, "com/helloworld");
    const bundleParts = bundleIdentifier.split(".");
    const androidNewPath = path.join(javaSrcPath, bundleParts.join("/"));
    if (await fs.pathExists(androidOldPath)) {
      await fs.ensureDir(path.dirname(androidNewPath));
      // Move the whole package tree into the correctly nested location
      await fs.move(androidOldPath, androidNewPath, { overwrite: true });

      // Replace package name in moved files (MainActivity.kt and MainApplication.kt)
      const mainActivityPath = path.join(androidNewPath, "MainActivity.kt");
      const mainApplicationPath = path.join(
        androidNewPath,
        "MainApplication.kt"
      );

      if (await fs.pathExists(mainActivityPath)) {
        let content = await fs.readFile(mainActivityPath, "utf8");
        // Force correct package declaration - replace any package declaration with correct one
        content = content.replace(
          /^package\s+[^\s\n]+/m,
          `package ${bundleIdentifier}`
        );
        // Replace getMainComponentName to use project name
        content = content.replace(
          /getMainComponentName\(\):\s*String\s*=\s*"[^"]+"/,
          `getMainComponentName(): String = "${projectName.toLowerCase()}"`
        );
        await fs.writeFile(mainActivityPath, content, "utf8");
      }

      if (await fs.pathExists(mainApplicationPath)) {
        let content = await fs.readFile(mainApplicationPath, "utf8");
        // Force correct package declaration - replace any package declaration with correct one
        content = content.replace(
          /^package\s+[^\s\n]+/m,
          `package ${bundleIdentifier}`
        );
        await fs.writeFile(mainApplicationPath, content, "utf8");
      }
    }

    // Force iOS bundle identifier to the provided value for base production target only
    // Environment targets will get their bundle identifiers set in createIosTargetsForEnvs
    // We need to do this AFTER creating environment targets to avoid conflicts
    // So this will be handled in the main flow after createIosTargetsForEnvs

    // Force iOS display name to provided value (and ensure key exists)
    const infoPlistPath = path.join(
      projectPath,
      `ios/${projectName}/Info.plist`
    );
    if (await fs.pathExists(infoPlistPath)) {
      let infoPlistContent = await fs.readFile(infoPlistPath, "utf8");

      const ensurePlistString = (content, key, value) => {
        const regex = new RegExp(
          `<key>${key}<\\/key>\\s*<string>[^<]*<\\/string>`,
          "m"
        );
        const replacement = `<key>${key}</key>\n\t<string>${value}</string>`;
        if (regex.test(content)) {
          return content.replace(regex, replacement);
        }
        // Insert before closing </dict> if the key is missing
        return content.replace(
          /<\/dict>\s*<\/plist>/m,
          `\t${replacement}\n</dict>\n</plist>`
        );
      };

      infoPlistContent = ensurePlistString(
        infoPlistContent,
        "CFBundleDisplayName",
        displayName
      );
      infoPlistContent = ensurePlistString(
        infoPlistContent,
        "CFBundleName",
        displayName
      );

      await fs.writeFile(infoPlistPath, infoPlistContent, "utf8");
    }

    // Force Android app_name to provided display name
    const stringsXmlPath = path.join(
      projectPath,
      "android/app/src/main/res/values/strings.xml"
    );
    if (await fs.pathExists(stringsXmlPath)) {
      let stringsContent = await fs.readFile(stringsXmlPath, "utf8");
      const regex = /<string name="app_name">[^<]*<\/string>/m;
      const replacement = `<string name="app_name">${displayName}</string>`;
      if (regex.test(stringsContent)) {
        stringsContent = stringsContent.replace(regex, replacement);
      } else {
        stringsContent = stringsContent.replace(
          /<\/resources>\s*$/m,
          `    ${replacement}\n</resources>`
        );
      }
      await fs.writeFile(stringsXmlPath, stringsContent, "utf8");
    }

    // Step 2.3.5: Copy fonts BEFORE creating environments (so base Info.plist is updated)
    await copyFonts(fontsDir, projectPath, projectName);

    // Environment-specific setup (Android/iOS)
    // Create environments even if only one is selected
    const selectedEnvs =
      envSetupSelectedEnvs && envSetupSelectedEnvs.length >= 1
        ? envSetupSelectedEnvs
        : [];
    if (selectedEnvs.length > 0) {
      await copyAndroidEnvSources(
        selectedEnvs,
        projectPath,
        bundleIdentifier,
        displayName
      );
      await updateAndroidBuildGradle(
        selectedEnvs,
        projectPath,
        bundleIdentifier
      );
      await updatePodfileForEnvs(selectedEnvs, projectPath, projectName);
      const buildableRefs = await createIosTargetsForEnvs(
        selectedEnvs,
        projectPath,
        projectName,
        bundleIdentifier,
        displayName
      );

      // CRITICAL: Verify staging config list IDs immediately after createIosTargetsForEnvs
      if (selectedEnvs && selectedEnvs.length > 1) {
        const pbxprojPath = path.join(
          projectPath,
          `ios/${projectName}.xcodeproj/project.pbxproj`
        );
        if (await fs.pathExists(pbxprojPath)) {
          let content = await fs.readFile(pbxprojPath, "utf8");
          for (const env of selectedEnvs) {
            if (env.toLowerCase() === "production") continue;
            const envSuffix = env.toLowerCase();
            const targetName = `${projectName}${
              envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
            }`;

            // Find staging config list
            const stagingConfigListMatch = content.match(
              new RegExp(
                `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                "m"
              )
            );
            if (stagingConfigListMatch) {
              const configIdsInList =
                stagingConfigListMatch[1].match(/\w{24}/g) || [];
              const configIdsFromList =
                stagingConfigListMatch[2].match(/\w{24}/g) || [];

              // Check base config IDs
              const baseConfigListMatch = content.match(
                new RegExp(
                  `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${projectName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}"\\s*\\*/[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                  "m"
                )
              );
              if (baseConfigListMatch) {
                const baseConfigIds =
                  baseConfigListMatch[2].match(/\w{24}/g) || [];
                const overlap = configIdsFromList.filter(id =>
                  baseConfigIds.includes(id)
                );
                if (overlap.length > 0) {
                  console.log(
                    chalk.red(
                      `❌ AFTER createIosTargetsForEnvs: ${targetName} config list uses SAME config IDs as base!`
                    )
                  );
                  console.log(
                    chalk.red(
                      `   Staging config IDs: ${configIdsFromList.join(
                        ", "
                      )}, Base: ${baseConfigIds.join(
                        ", "
                      )}, Overlap: ${overlap.join(", ")}`
                    )
                  );
                } else {
                  console.log(
                    chalk.green(
                      `✅ AFTER createIosTargetsForEnvs: ${targetName} config list correctly uses different config IDs: ${configIdsFromList.join(
                        ", "
                      )}`
                    )
                  );
                }
              }
            }
          }
        }
      }

      // Set bundle identifier for base production target (after environment targets are created)
      // This ensures we only update the base target's configs, not the environment ones
      const pbxprojPath = path.join(
        projectPath,
        `ios/${projectName}.xcodeproj/project.pbxproj`
      );
      if (await fs.pathExists(pbxprojPath)) {
        let pbxprojContent = await fs.readFile(pbxprojPath, "utf8");

        // Find the base target's configuration list ID
        // Base target has config list with name "Build configuration list for PBXNativeTarget \"{projectName}\""
        // IMPORTANT: Must match EXACTLY "{projectName}" without any suffix (like "Staging", "Dev", etc.)
        // Use word boundary to ensure we don't match environment targets like "lepimvarimStaging"
        const escapedProjectName = projectName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        const baseConfigListMatch = pbxprojContent.match(
          new RegExp(
            `(\\w{24})\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "${escapedProjectName}"\\s*\\*\\/`,
            "m"
          )
        );

        if (baseConfigListMatch) {
          const baseConfigListId = baseConfigListMatch[1];

          // CRITICAL: Verify that base target references the correct config list
          const baseTargetMatch = pbxprojContent.match(
            new RegExp(
              `(\\w{24})\\s*/\\*\\s*${escapedProjectName}\\s*\\*/[\\s\\S]*?buildConfigurationList\\s*=\\s*(\\w{24})(\\s*/\\*\\s*Build configuration list for PBXNativeTarget "([^"]*)"\\s*\\*/)`,
              "m"
            )
          );
          if (baseTargetMatch) {
            const baseTargetId = baseTargetMatch[1];
            const baseTargetConfigListId = baseTargetMatch[2];
            const baseTargetComment = baseTargetMatch[4];
            if (
              baseTargetConfigListId !== baseConfigListId ||
              baseTargetComment !== projectName
            ) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: Base target references wrong config list! Expected ID: ${baseConfigListId}, Comment: ${projectName}. Found ID: ${baseTargetConfigListId}, Comment: ${baseTargetComment}`
                )
              );
              // According to REFERENCE_FIX_ANALYSIS, we should NOT fix buildConfigurationList in PBXNativeTarget
              // But we need to log this error so the user knows what's wrong
              console.log(
                chalk.yellow(
                  `⚠️  NOTE: According to REFERENCE_FIX_ANALYSIS, we should NOT fix buildConfigurationList in PBXNativeTarget. The base target should have been created with the correct config list ID in createIosTargetsForEnvs.`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ Base target correctly references config list ID: ${baseConfigListId}`
                )
              );
            }
          }

          // Find all config IDs in this config list
          // Use precise pattern: match config list block starting with the specific ID and comment
          const escapedConfigListId = baseConfigListId.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          const configListBlockMatch = pbxprojContent.match(
            new RegExp(
              `${escapedConfigListId}\\s*\\/\\*\\s*Build configuration list for PBXNativeTarget "${escapedProjectName}"\\s*\\*\\/\\s*=\\s*\\{[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
              "m"
            )
          );

          if (configListBlockMatch) {
            const configIds = configListBlockMatch[1].match(/\w{24}/g) || [];

            // CRITICAL: Base target should have its own config IDs
            // These config IDs should be in the base config list with comment "{projectName}"
            // If all config IDs belong to environment targets, it means base target's config list
            // contains wrong config IDs (probably from staging target)
            // In this case, we should still try to update bundle ID in these configs,
            // but log a warning
            const validConfigIds = [];
            const envConfigIds = new Set();

            // First, collect all config IDs from environment targets
            for (const env of selectedEnvs) {
              if (env.toLowerCase() === "production") continue;
                      const envSuffix = env.toLowerCase();
              const targetName = `${projectName}${
                envSuffix.charAt(0).toUpperCase() + envSuffix.slice(1)
              }`;
              const envConfigListMatch = pbxprojContent.match(
                new RegExp(
                  `(\\w{24})\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}"\\s*\\*/`
                )
              );
              if (envConfigListMatch) {
                const envConfigListId = envConfigListMatch[1];
                console.log(
                  chalk.cyan(
                    `📸 Found ${targetName} config list ID: ${envConfigListId}`
                  )
                );
                // CRITICAL: Use more precise pattern to match only the config list block
                // Pattern: configListId /* comment */ = { ... buildConfigurations = ( ... ); ... };
                const envConfigListBlockMatch = pbxprojContent.match(
                  new RegExp(
                    `${envConfigListId.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}\\s*/\\*\\s*Build configuration list for PBXNativeTarget "${targetName.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    )}"\\s*\\*/\\s*=\\s*\\{[\\s\\S]*?buildConfigurations\\s*=\\s*\\(([\\s\\S]*?)\\);`,
                    "m"
                  )
                );
                if (envConfigListBlockMatch) {
                  // Extract only config IDs with comments (Debug/Release)
                  const configIdsWithComments = envConfigListBlockMatch[1];
                  // Use exec in a loop to find all matches
                  const configIdRegex =
                    /(\w{24})\s*\/\*\s*(Debug|Release)\s*\*\//g;
                  const envConfigIdsOnly = [];
                  let match;
                  while (
                    (match = configIdRegex.exec(configIdsWithComments)) !== null
                  ) {
                    envConfigIdsOnly.push(match[1]);
                  }
                  if (envConfigIdsOnly.length > 0) {
                    console.log(
                      chalk.cyan(
                        `📸 ${targetName} config list contains config IDs: ${envConfigIdsOnly.join(
                          ", "
                        )}`
                      )
                    );
                    envConfigIdsOnly.forEach(id => envConfigIds.add(id));
                  } else {
                    console.log(
                      chalk.yellow(
                        `⚠️  Could not extract config IDs from ${targetName} config list`
                      )
                    );
                  }
                }
              }
            }

            console.log(
              chalk.cyan(
                `📸 Base config list contains config IDs: ${configIds.join(
                  ", "
                )}`
              )
            );

            // Now check which config IDs from base config list belong to environment targets
            for (const configId of configIds) {
              if (envConfigIds.has(configId)) {
                console.log(
                  chalk.red(
                    `❌ Config ID ${configId} from base config list ALSO belongs to an environment target! This is wrong - base and staging targets should have different config IDs.`
                  )
                );
                // CRITICAL: Base target and environment targets should NOT share config IDs
                // This means base target's config list contains wrong config IDs
                // We should NOT use these config IDs for updating bundle ID, as they will
                // also affect environment targets
              } else {
                validConfigIds.push(configId);
                console.log(
                  chalk.green(
                    `✅ Config ID ${configId} from base config list is unique (not in environment targets)`
                  )
                );
              }
            }

            // If all config IDs belong to environment targets, it's a critical error
            // But we should still try to update bundle ID in these configs as a fallback
            if (validConfigIds.length === 0 && configIds.length > 0) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: All config IDs from base config list belong to environment targets! Base target's config list contains wrong config IDs.`
                )
              );
              console.log(
                chalk.yellow(
                  `⚠️  Using config IDs from base config list anyway as fallback: ${configIds.join(
                    ", "
                  )}`
                )
              );
              // Use config IDs from base config list as fallback
              validConfigIds.push(...configIds);
            }

            // Update PRODUCT_BUNDLE_IDENTIFIER only in validated config blocks
            // These configs belong only to the base target (or we use fallback if all belong to env targets)
            if (validConfigIds.length === 0) {
              console.log(
                chalk.red(
                  `❌ CRITICAL: No valid config IDs found for base target! This should not happen after fallback.`
                )
              );
            } else {
              console.log(
                chalk.green(
                  `✅ Found ${
                    validConfigIds.length
                  } valid config ID(s) for base target: ${validConfigIds.join(
                    ", "
                  )}`
                )
              );
              for (const configId of validConfigIds) {
                // Update bundle identifier
                const configBlockRegex = new RegExp(
                  `(${configId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?PRODUCT_BUNDLE_IDENTIFIER\\s*=\\s*)[^;]+(;)`,
                  "m"
                );

                const beforeReplace = pbxprojContent;
                if (configBlockRegex.test(pbxprojContent)) {
                  pbxprojContent = pbxprojContent.replace(
                    configBlockRegex,
                    `$1${bundleIdentifier}$2`
                  );
                  if (beforeReplace !== pbxprojContent) {
                    console.log(
                      chalk.green(
                        `✅ Updated PRODUCT_BUNDLE_IDENTIFIER to ${bundleIdentifier} in config ${configId}`
                      )
                    );
                  } else {
                    console.log(
                      chalk.yellow(
                        `⚠️  Could not replace PRODUCT_BUNDLE_IDENTIFIER in config ${configId}`
                      )
                    );
                  }
                } else {
                  console.log(
                    chalk.yellow(
                      `⚠️  Could not find PRODUCT_BUNDLE_IDENTIFIER in config ${configId}`
                    )
                  );
                }

                // Update display name for base target (production)
                // Base target should have display name without environment suffix
                const displayNameRegex = new RegExp(
                  `(${configId.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                  )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?)(INFOPLIST_KEY_CFBundleDisplayName\\s*=\\s*[^;]+;)?`,
                  "m"
                );

                const displayNameMatch = pbxprojContent.match(displayNameRegex);
                if (displayNameMatch) {
                  const beforeDisplayName = pbxprojContent;
                  if (displayNameMatch[2]) {
                    // Replace existing display name
                    pbxprojContent = pbxprojContent.replace(
                      new RegExp(
                        `(${configId.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&"
                        )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?)INFOPLIST_KEY_CFBundleDisplayName\\s*=\\s*[^;]+;`,
                        "m"
                      ),
                      `$1INFOPLIST_KEY_CFBundleDisplayName = "${displayName}";`
                    );
                  } else {
                    // Add display name after INFOPLIST_FILE
                    pbxprojContent = pbxprojContent.replace(
                      new RegExp(
                        `(${configId.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&"
                        )}[\\s\\S]*?buildSettings\\s*=\\s*\\{[\\s\\S]*?INFOPLIST_FILE\\s*=\\s*[^;]+;\\s*)`,
                        "m"
                      ),
                      `$1\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "${displayName}";\n`
                    );
                  }
                  if (beforeDisplayName !== pbxprojContent) {
                    console.log(
                      chalk.green(
                        `✅ Updated INFOPLIST_KEY_CFBundleDisplayName to "${displayName}" in config ${configId}`
                      )
                    );
                  }
                }
              }
            }
          }
        }

        // NOTE: According to REFERENCE_FIX_ANALYSIS, in the reference project there were NO changes
        // to buildConfigurationList in PBXNativeTarget blocks, so we don't need to verify or fix
        // staging targets after bundle ID update. The staging targets should already have correct
        // buildConfigurationList IDs from createIosTargetsForEnvs.

        await fs.writeFile(pbxprojPath, pbxprojContent, "utf8");
      }

      await createIosEnvSchemes(
        selectedEnvs,
        projectPath,
        projectName,
        buildableRefs || {},
        firebaseEnabled ? firebaseFilesByEnv : {}
      );

      // Create .env files for all environments
      await createEnvFiles(selectedEnvs, projectPath);

      // Add scripts to package.json
      await addScriptsToPackageJson(
        selectedEnvs,
        projectPath,
        projectName,
        bundleIdentifier
      );
    }

    if (firebaseEnabled) {
      await addFirebaseDependencies(
        projectPath,
        firebaseModules,
        bundleIdentifier
      );
      await ensureGoogleServicesPlugin(projectPath);
      // Check if we have multiple environments in Firebase config
      const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
      const hasMultipleEnvs = envsInFirebase.length > 1;
      await copyFirebaseGoogleFiles(
        firebaseFilesByEnv,
        projectPath,
        projectName,
        hasMultipleEnvs
      );
      await updatePodfileForFirebase(projectPath, firebaseModules);
      await updateAppDelegateForFirebase(projectPath, projectName);

      // Copy Firebase lib modules (analytics, remote-config) if selected
      const libModules = firebaseModules.filter(
        module => module === "analytics" || module === "remote-config"
      );
      if (libModules.length > 0) {
        await copyFirebaseLibModules(projectPath, libModules);
      }
    }

    // Create Zustand storage setup if selected OR if required by enabled features
    // (auth store + localization store require zustandStorage)
    const needsZustandStorage =
      zustandStorage || navigationMode === "with-auth" || localizationEnabled;
    if (needsZustandStorage) {
      const libPath = path.join(projectPath, "src/lib");
      await fs.ensureDir(libPath);

      const storageFilePath = path.join(libPath, "storage.ts");
      // Check if storage already exists (might have been created earlier)
      if (!(await fs.pathExists(storageFilePath))) {
        const storageContent = `import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

const storage = createMMKV();

export const zustandStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: name => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: name => storage.remove(name),
};
`;

        await fs.writeFile(storageFilePath, storageContent, "utf8");

        if (
          !zustandStorage &&
          (navigationMode === "with-auth" || localizationEnabled)
        ) {
          const reasons = [];
          if (navigationMode === "with-auth") reasons.push("auth navigation");
          if (localizationEnabled) reasons.push("localization");
          console.log(
            chalk.green(
              `✅ Created Zustand storage setup (required for ${reasons.join(
                " + "
              )})`
            )
          );
        } else {
          console.log(chalk.green("✅ Created Zustand storage setup"));
        }
      } else if (navigationMode === "with-auth" || localizationEnabled) {
        console.log(
          chalk.green(
            "✅ Zustand storage already exists (required for selected features)"
          )
        );
      }
    }

    // Navigation and auth setup based on navigationMode
    if (navigationMode === "with-auth") {
      // Copy auth template (store, types, etc.)
      await copyAuthTemplate(projectPath);
      // Copy full navigation template (RootNavigator, AuthNavigator, AppNavigator)
      await copyNavigationTemplate(projectPath, "with-auth");
    } else if (navigationMode === "app-only") {
      // Copy only AppNavigator (no auth folder, no RootNavigator/AuthNavigator)
      await copyNavigationTemplate(projectPath, "app-only");
    }

    // Localization setup (optional)
    if (localizationEnabled) {
      await addLocalizationDependencies(projectPath);
      await copyLocalizationTemplate(projectPath);
      await configureLocalization(
        projectPath,
        localizationDefaultLanguage,
        localizationWithRemoteConfig
      );

      // If localization with remote-config is enabled, ensure remote-config module is copied
      if (localizationWithRemoteConfig) {
        const firebaseRemoteConfigEnabled =
          firebaseEnabled && firebaseModules.includes("remote-config");
        if (firebaseRemoteConfigEnabled) {
          // Remote-config module should already be copied by Firebase setup above
          console.log(
            chalk.green(
              "✅ Remote Config module available for localization integration"
            )
          );
        } else {
          console.log(
            chalk.yellow(
              "⚠️  Localization with Remote Config is enabled, but Firebase Remote Config is not."
            )
          );
          console.log(
            chalk.yellow(
              "    Please enable Firebase Remote Config for this feature to work."
            )
          );
        }
      }
    }

    // Update App.tsx if navigation and/or localization was selected
    await updateAppTsxForSetup(projectPath, {
      navigationMode,
      localizationEnabled,
    });

    // Add GoogleServices folder/file to Xcode project (after all targets are created)
    if (firebaseEnabled) {
      const envsInFirebase = Object.keys(firebaseFilesByEnv || {});
      const hasMultipleEnvs = envsInFirebase.length > 1;
      await addGoogleServicesToXcodeProject(
        projectPath,
        projectName,
        selectedEnvs,
        hasMultipleEnvs
      );
    }

    // Maps setup
    if (!mapsEnabled) {
      // Remove react-native-maps dependencies if maps are not enabled
      await removeMapsDependencies(projectPath);
      // Also remove Google Maps code if maps are not enabled
      await updatePodfileForMaps(projectPath, false);
      await updateAppDelegateForMaps(projectPath, projectName, false, null);
      await updateAndroidManifestForMaps(projectPath, false, null);
    } else {
      // Update Podfile for Google Maps (only affects iOS)
      await updatePodfileForMaps(projectPath, enableGoogleMaps);
      // Update AppDelegate for Google Maps (only affects iOS)
      await updateAppDelegateForMaps(
        projectPath,
        projectName,
        enableGoogleMaps,
        googleMapsApiKey
      );
      // Update AndroidManifest for Google Maps
      // On Android, Google Maps is always required for react-native-maps
      // So we only comment if Google Maps is explicitly disabled AND no API key provided
      await updateAndroidManifestForMaps(
        projectPath,
        enableGoogleMaps,
        googleMapsApiKey
      );
    }

    // Rename default iOS scheme if no environments were selected
    if (!selectedEnvs || selectedEnvs.length === 0) {
      await renameDefaultIosScheme(projectPath, projectName);
    }

    replaceSpinner.succeed("Placeholders replaced");
  } catch (error) {
    replaceSpinner.fail("Failed to replace placeholders");
    throw error;
  }

  // Step 2.4: Copy splash screen images if provided
  await copySplashScreenImages(splashScreenDir, projectPath, projectName);

  // Step 2.6: Copy app icons if provided
  await copyAppIcons(appIconDir, projectPath, projectName);

  // Step 3: Install dependencies
  let dependenciesInstalled = false;

  if (!skipInstall) {
    console.log(
      chalk.cyan(`\n📦 Installing dependencies with ${packageManager}...\n`)
    );

    try {
      const installArgs =
        packageManager === "npm"
          ? ["install", "--legacy-peer-deps"]
          : ["install"];

      await execa(packageManager, installArgs, {
        cwd: projectPath,
        stdio: "inherit",
        shell: true,
      });
      console.log(chalk.green("\n✅ Dependencies installed successfully!\n"));
      dependenciesInstalled = true;
    } catch (error) {
      console.log(chalk.red("\n❌ Failed to install dependencies"));

      if (error.message) {
        console.log(chalk.dim(`Error: ${error.message}`));
      }

      console.log(
        chalk.yellow(`\nYou can install dependencies manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  ${packageManager} install\n`));
    }

    // Install pods for iOS only if dependencies were installed successfully
    if (dependenciesInstalled && process.platform === "darwin" && !skipPods) {
      let shouldInstallPods = autoYes;

      if (!autoYes) {
        const inquirer = require("inquirer");
        const { installPods } = await inquirer.prompt([
          {
            type: "confirm",
            name: "installPods",
            message: "Install iOS CocoaPods now?",
            default: true,
          },
        ]);
        shouldInstallPods = installPods;
      }

      if (shouldInstallPods) {
        console.log(chalk.cyan("\n📦 Installing iOS CocoaPods...\n"));
        try {
          await execa("pod", ["install"], {
            cwd: path.join(projectPath, "ios"),
            stdio: "inherit",
            shell: true,
          });
          console.log(
            chalk.green("\n✅ iOS CocoaPods installed successfully!\n")
          );
        } catch (error) {
          console.log(chalk.red("\n❌ Failed to install CocoaPods"));
          if (error.message) {
            console.log(chalk.dim(`Error: ${error.message}`));
          }
          console.log(
            chalk.yellow(`\nYou can install them manually later with:`)
          );
          console.log(chalk.cyan(`  cd ${projectName}/ios`));
          console.log(chalk.cyan(`  pod install\n`));
        }
      } else {
        console.log(chalk.yellow("\n⏭️  Skipping iOS CocoaPods installation"));
        console.log(chalk.gray("You can install them later with:"));
        console.log(chalk.cyan(`  cd ${projectName}/ios && pod install\n`));
      }
    } else if (!dependenciesInstalled && process.platform === "darwin") {
      console.log(
        chalk.yellow(
          "⚠️  Skipping iOS CocoaPods installation (dependencies not installed)\n"
        )
      );
    }
  }

  // Step 5: Initialize git
  if (!skipGit) {
    console.log(chalk.cyan("\n📁 Initializing git repository...\n"));
    try {
      await execa("git", ["init"], { cwd: projectPath });
      await execa("git", ["add", "."], { cwd: projectPath });
      await execa(
        "git",
        ["commit", "-m", "Initial commit from @giltripper/create-rn-app"],
        { cwd: projectPath }
      );
      console.log(chalk.green("✅ Git repository initialized\n"));
    } catch (error) {
      console.log(chalk.red("❌ Failed to initialize git"));
      console.log(
        chalk.yellow(`\nYou can initialize git manually later with:`)
      );
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan(`  git init`));
      console.log(chalk.cyan(`  git add .`));
      console.log(chalk.cyan(`  git commit -m "Initial commit"\n`));
    }
  }
}

module.exports = { createApp };
