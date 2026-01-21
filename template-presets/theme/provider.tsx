import React, { useEffect, useState } from "react";
import { useColorScheme, StyleSheet } from "react-native";

import { darkTheme, lightTheme } from "./themes";
import { useThemeStore } from "./store";
import type { Listener, ThemeType } from "./types";
import type { ViewStyle, TextStyle, ImageStyle } from "react-native";
import type { PropsWithChildren } from "react";

class ThemeManager {
  private theme: ThemeType = lightTheme;
  private listeners = new Set<Listener>();

  public setTheme(newTheme: ThemeType) {
    this.theme = newTheme;
    this.listeners.forEach(listener => listener(newTheme));
  }

  public getTheme() {
    return this.theme;
  }

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const ThemeContext = React.createContext({} as ThemeType);

const themeManager = new ThemeManager();

export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const scheme = useColorScheme();
  const { theme: selectedTheme } = useThemeStore();
  const [theme, setTheme] = useState(lightTheme);

  useEffect(() => {
    let currentTheme: ThemeType;

    // Определяем тему на основе настроек пользователя
    switch (selectedTheme) {
      case "dark":
        currentTheme = darkTheme;
        break;
      case "light":
        currentTheme = lightTheme;
        break;
      case "system":
      default:
        // Для системной темы используем схему устройства
        currentTheme = scheme === "dark" ? darkTheme : lightTheme;
        break;
    }

    themeManager.setTheme(currentTheme);
    setTheme(currentTheme);
  }, [scheme, selectedTheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => React.useContext(ThemeContext);

type NamedStyle = ViewStyle | TextStyle | ImageStyle;

export type StyleCreator<T extends Record<string, NamedStyle>> = (theme: ThemeType) => T;

const cache = new WeakMap<StyleCreator<Record<string, NamedStyle>>, StyleSheet.NamedStyles<unknown>>();
export const AppStyleSheet = {
  create: <T extends Record<string, NamedStyle>>(creator: StyleCreator<T>): (() => { [K in keyof T]: T[K] }) => {
    if (__DEV__) {
      // In development mode, create a memoized style function
      const getStyles = () => StyleSheet.create(creator(themeManager.getTheme()));

      return getStyles;
    }

    const cached = cache.get(creator) as { [K in keyof T]: T[K] } | undefined;

    if (cached) {
      return () => cached;
    }

    const initial = StyleSheet.create(creator(themeManager.getTheme()));
    cache.set(creator, initial);

    themeManager.subscribe(theme => {
      cache.set(creator, StyleSheet.create(creator(theme)));
    });

    return () => cache.get(creator)! as { [K in keyof T]: T[K] };
  },
};

export function useAppStyleSheet<T>(getStyles: () => T): T {
  const [styles, setStyles] = useState(getStyles);

  useEffect(() => {
    const unsubscribe = themeManager.subscribe(() => {
      setStyles(getStyles());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Force update when getStyles changes only in dev mode
  React.useEffect(() => {
    if (__DEV__) {
      setStyles(getStyles());
    }
  }, [getStyles]);

  return styles;
}
