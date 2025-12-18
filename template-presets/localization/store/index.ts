import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "~/lib/storage";
import type { LocalizationState } from "~/lib/localization/types";

export const useLocalizationStore = create<LocalizationState>()(
  persist(
    set => ({
      language: "ru",
      setLanguage: language => set(state => ({ ...state, language })),
    }),
    { name: "localization", storage: createJSONStorage(() => zustandStorage) },
  ),
);
