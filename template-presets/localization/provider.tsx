import React, { createContext, useContext } from "react";
import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next, useTranslation } from "react-i18next";
import { useLocalize } from "react-native-localize";
import ru from "./languages/ru.json";
import { useLocalizationStore } from "./store";
import type {
  I18nContextProps,
  LocalizationContextProps,
  TranslationComponents,
} from "./types";
import type { ReactNode } from "react";

const LocalizationContext = createContext<LocalizationContextProps | undefined>(
  undefined
);

const parseWithComponents = (
  str: string,
  components: TranslationComponents
): ReactNode => {
  const regex = /<(\w+)>(.*?)<\/\1>/gs;
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
export const LocalizationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { t: rawT } = useTranslation();

  const { language, setLanguage } = useLocalizationStore();
  const { getLocales } = useLocalize();

  const rich: I18nContextProps["rich"] = (key, components, options?) => {
    const str = rawT(key, options);

    return parseWithComponents(str, components);
  };

  const initLocalization = async () => {
    let lang = language;

    if (!lang) {
      lang = getLocales()[0].languageCode;
      setLanguage(lang);
    }

    await i18n.use(initReactI18next).use(ICU).init({
      // add all languages your app supports (from languages folder)
      resources: { ru: { translation: ru } },
      lng: lang,
      fallbackLng: lang,
      interpolation: { escapeValue: false },
    });
  };

  const changeLanguage = async (language: string) => {
    await i18n.changeLanguage(language);
    setLanguage(language);
  };

  return (
    <LocalizationContext.Provider
      value={{ t: rawT, rich, initLocalization, changeLanguage }}
    >
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = (): LocalizationContextProps => {
  const context = useContext(LocalizationContext);

  if (!context) {
    throw new Error("useLocalization must be used within LocalizationProvider");
  }

  return context;
};
