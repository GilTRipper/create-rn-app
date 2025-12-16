export type AuthState = {
  authorized: boolean;
  setAuthorized: (authorized: boolean) => void;
  accessToken: string;
  setAccessToken: (accessToken: string) => void;
};
