import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { zustandStorage } from "~/lib/storage";
import type { AuthState } from "~/auth/types";

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      authorized: false,
      setAuthorized: authorized => set(state => ({ ...state, authorized })),
      accessToken: "",
      setAccessToken: accessToken => set(state => ({ ...state, accessToken })),
    }),
    { name: "auth", storage: createJSONStorage(() => zustandStorage) }
  )
);

export const useIsAuthorized = () =>
  useAuthStore(useShallow(state => state.authorized));
export const useAccessToken = () =>
  useAuthStore(useShallow(state => state.accessToken));
