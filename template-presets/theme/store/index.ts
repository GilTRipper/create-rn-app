import { create } from "zustand";
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
