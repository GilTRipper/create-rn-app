import type { lightTheme } from "./themes";

export type ThemeVariants = "system" | "light" | "dark";

export type ThemeState = {
  theme: ThemeVariants;
  setTheme: (theme: ThemeVariants) => void;
};

export type ThemeType = typeof lightTheme;
export type Listener = (theme: ThemeType) => void;
