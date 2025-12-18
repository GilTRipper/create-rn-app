import type { ReactNode } from "react";
import type ru from "./languages/ru.json";

export type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;
export type FinalPaths<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: T[K] extends object
        ? Join<K, FinalPaths<T[K]>>
        : K;
    }[keyof T & (string | number)]
  : never;
export type TranslationKey = FinalPaths<typeof ru>;

export type TranslationOptions = Record<string, string | number> | undefined;

export type TranslationComponents = Record<string, (_: ReactNode) => ReactNode>;

export type I18nContextProps = {
  t: (key: TranslationKey, options?: TranslationOptions) => string;
  rich: (
    key: TranslationKey,
    components: TranslationComponents,
    options?: TranslationOptions
  ) => ReactNode;
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
