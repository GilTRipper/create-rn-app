const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

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
  const sourceLocalizationPath = path.join(TEMPLATE_PRESETS, "localization");

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
  withRemoteConfig = false,
  useZustand = true
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
    ? `    if (isInitialized) {
      return;
    }

    let lng = language || ${JSON.stringify(lang)};
    if (!language) {
      setLanguage(${JSON.stringify(lang)});
    }

    // Load resources only from Remote Config
    const allRemoteLocalizations = await remoteConfig.getAllJSON<Record<string, typeof translations>>({
      defaults: {},
    });

    // Build resources object - use only Remote Config
    const resources: Record<string, { translation: typeof translations }> = {};
    for (const [langCode, remoteTranslation] of Object.entries(allRemoteLocalizations)) {
      if (remoteTranslation && Object.keys(remoteTranslation).length > 0) {
        resources[langCode] = { translation: remoteTranslation };
      }
    }

    // If no resources loaded, use local file as last resort
    if (Object.keys(resources).length === 0) {
      console.warn("No Remote Config resources found, using local file as fallback");
      resources[${JSON.stringify(lang)}] = { translation: translations };
    }

    if (!resources[lng]) {
      lng = ${JSON.stringify(lang)};
      setLanguage(${JSON.stringify(lang)});
      if (!resources[lng]) {
        resources[lng] = { translation: translations };
      }
    }

    // Add resources from Remote Config only
    for (const [langCode, resource] of Object.entries(resources)) {
      // Remove if exists
      if (i18n.hasResourceBundle(langCode, "translation")) {
        i18n.removeResourceBundle(langCode, "translation");
      }
      // Clear from store
      if (i18n.store.data[langCode]?.translation) {
        delete i18n.store.data[langCode].translation;
      }
      // Add new resources
      i18n.addResourceBundle(langCode, "translation", resource.translation, false, true);
    }

    // Disable fallback to prevent using local file
    i18n.options.fallbackLng = false;

    // Force language change to trigger re-render of all components
    const currentLang = i18n.language;
    if (currentLang === lng) {
      await i18n.changeLanguage("en");
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    }
    await i18n.changeLanguage(lng);

    // Emit event to force re-render of all useTranslation hooks
    i18n.emit("languageChanged", lng);

    setIsInitialized(true);
    console.info("Localization initialized. Translation:", i18n.language);`
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

  const storeImport = useZustand
    ? `import { useLocalizationStore } from "./store";`
    : "";

  const stateHook = useZustand
    ? `  const { language, setLanguage } = useLocalizationStore();
  const { getLocales } = useLocalize();`
    : `  const { getLocales } = useLocalize();
  const [language, setLanguageState] = useState<string>(() => {
    return getLocales()[0]?.languageCode || ${JSON.stringify(lang)};
  });
  const setLanguage = (lang: string) => {
    setLanguageState(lang);
  };`;

  const isInitializedState = withRemoteConfig
    ? `  const [isInitialized, setIsInitialized] = React.useState(false);`
    : "";

  const i18nInit = withRemoteConfig
    ? `${stateHook}
${isInitializedState}

  // Initialize i18n without resources - they will be loaded from Remote Config
  if (!i18n.isInitialized) {
    i18n
      .use(initReactI18next)
      .use(ICU)
      .init({
        resources: {},
        lng: ${JSON.stringify(lang)},
        fallbackLng: false, // No fallback - use only Remote Config
        interpolation: { escapeValue: false },
      });
  }

  const { t: rawT, i18n: i18nInstance } = useTranslation();`
    : `  const { t: rawT, i18n: i18nInstance } = useTranslation();

${stateHook}`;

  const useStateImport = useZustand ? "" : `import { useState } from "react";`;

  const providerContent = `import React, { createContext, useContext } from "react";
${useStateImport}
import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next, useTranslation } from "react-i18next";
import { useLocalize } from "react-native-localize";
import translations from "./languages/${lang}.json";
${storeImport}
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

  const changeLanguage = async (targetLanguage: string) => {
    try {
      // Prevent multiple simultaneous language changes
      if (i18n.language === targetLanguage) {
        return;
      }

${withRemoteConfig ? `      // Check if resources exist for the target language
      const hasResources = i18n.hasResourceBundle(targetLanguage, "translation");

      if (!hasResources) {
        // Load from Remote Config only
        const allRemoteLocalizations = await remoteConfig.getAllJSON<Record<string, typeof translations>>({
          defaults: {},
        });

        const remoteTranslation = allRemoteLocalizations[targetLanguage];
        if (remoteTranslation && Object.keys(remoteTranslation).length > 0) {
          i18n.addResourceBundle(targetLanguage, "translation", remoteTranslation, false, true);
        } else {
          // If no Remote Config, use local file as last resort
          console.warn(\`No Remote Config for language: \${targetLanguage}, using local file\`);
          if (targetLanguage === ${JSON.stringify(lang)}) {
            i18n.addResourceBundle(${JSON.stringify(lang)}, "translation", translations, false, true);
          } else {
            // Fallback to ${JSON.stringify(lang)}
            targetLanguage = ${JSON.stringify(lang)};
            if (!i18n.hasResourceBundle(${JSON.stringify(lang)}, "translation")) {
              i18n.addResourceBundle(${JSON.stringify(lang)}, "translation", translations, false, true);
            }
          }
        }
      }` : ""}

      // Change language
      await i18n.changeLanguage(targetLanguage);

      // Only update store if language actually changed
      if (i18n.language === targetLanguage) {
        setLanguage(targetLanguage);
      }
    } catch (error) {
      console.error("Error changing language:", error);
    }
  };

  // Use i18nInstance.language to ensure context updates when language changes
  const contextValue = React.useMemo(
    () => ({
      t: rawT,
      rich,
      initLocalization,
      changeLanguage,
      language: i18nInstance.language || language,
    }),
    [rawT, rich, initLocalization, changeLanguage, i18nInstance.language, language],
  );

  return (
    <LocalizationContext.Provider value={contextValue}>{children}</LocalizationContext.Provider>
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
  language: string;
};

export type LocalizationState = {
  language: string;
  setLanguage: (language: string) => void;
};
`;

  const storeContent = useZustand
    ? `import { create } from "zustand";
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
`
    : `// Store not needed - using useState in provider instead
export {};
`;

  await fs.writeFile(providerPath, providerContent, "utf8");
  await fs.writeFile(typesPath, typesContent, "utf8");
  await fs.writeFile(storePath, storeContent, "utf8");

  console.log(
    chalk.green(`✅ Configured localization (default language: ${lang})`)
  );
}

async function apply(ctx) {
  const { projectPath, localization = {}, firebase = {}, zustandStorage } =
    ctx.config;
  const localizationEnabled = localization?.enabled || false;
  if (!localizationEnabled) {
    return;
  }

  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const localizationDefaultLanguage = localization?.defaultLanguage || "ru";
  const localizationWithRemoteConfig = localization?.withRemoteConfig || false;

  await addLocalizationDependencies(projectPath);
  await copyLocalizationTemplate(projectPath);
  await configureLocalization(
    projectPath,
    localizationDefaultLanguage,
    localizationWithRemoteConfig,
    zustandStorage
  );

  if (localizationWithRemoteConfig) {
    const firebaseRemoteConfigEnabled =
      firebaseEnabled && firebaseModules.includes("remote-config");
    if (firebaseRemoteConfigEnabled) {
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

module.exports = {
  apply,
  addLocalizationDependencies,
  copyLocalizationTemplate,
  configureLocalization,
};
