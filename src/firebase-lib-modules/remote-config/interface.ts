import type { RemoteConfigOptions } from "./types";

export interface RemoteConfigInterface {
  getBoolean(value: string, options?: RemoteConfigOptions): Promise<boolean>;
  getString(value: string, options?: RemoteConfigOptions): Promise<string>;
  getJSON<T extends Record<string, string | number | boolean | null>>(
    value: string,
    options?: RemoteConfigOptions
  ): Promise<T>;
  getNumber(value: string, options?: RemoteConfigOptions): Promise<number>;
}
