import {
  getRemoteConfig,
  setCustomSignals,
  fetchConfig,
  fetchAndActivate,
  getAll,
  getValue,
} from "@react-native-firebase/remote-config";

import type { Analytics } from "~/lib/analytics/implementation";
import type {
  RemoteConfig as FirebaseRemoteConfig,
  Value as RemoteConfigValue,
} from "@react-native-firebase/remote-config";

import type { ReactNativeFirebase } from "@react-native-firebase/app";
import type { RemoteConfigInterface } from "./interface";
import type { RemoteConfigOptions } from "./types";

export class RemoteConfig implements RemoteConfigInterface {
  private config: FirebaseRemoteConfig;
  private analytics?: Analytics;

  public constructor(
    app: ReactNativeFirebase.FirebaseApp,
    analytics?: Analytics
  ) {
    if (analytics) {
      this.analytics = analytics;
    }

    this.config = getRemoteConfig(app);
    // v26 dropped fetch(config, expirationSeconds). A zero minimum fetch
    // interval is the equivalent of the zero expiration used before.
    this.config.settings = {
      ...this.config.settings,
      minimumFetchIntervalMillis: 0,
    };
  }

  private async fetch() {
    await fetchConfig(this.config);
    await fetchAndActivate(this.config);
  }

  private async setPropertiesOrSignals(options: RemoteConfigOptions) {
    const signals = options?.signals;
    const userProperties = options?.userProperties;

    if (signals) {
      await setCustomSignals(this.config, signals);
    }

    if (userProperties && this.analytics) {
      await this.analytics.setUserProperties(userProperties);
    }
  }

  private setDefaultValue(
    defaults: Record<string, string | number | boolean>
  ) {
    // v26 exposes defaults as a property; assigning it calls native setDefaults.
    this.config.defaultConfig = { ...this.config.defaultConfig, ...defaults };
  }

  private async prepareAndGetValue(
    value: string,
    options: RemoteConfigOptions = {}
  ) {
    if (options.defaults) {
      this.setDefaultValue(options.defaults);
    }

    if (options) {
      await this.setPropertiesOrSignals(options);
    }

    await this.fetch();

    const result = getValue(this.config, value);

    return result;
  }

  public async getJSON<
    T extends Record<string, string | number | boolean | object | null>
  >(value: string, options?: RemoteConfigOptions) {
    const res = await this.prepareAndGetValue(value, options);

    return JSON.parse(res.asString() || "{}") as T;
  }

  public async getString(value: string, options: RemoteConfigOptions) {
    const res = await this.prepareAndGetValue(value, options);

    return res.asString();
  }

  public async getBoolean(value: string, options: RemoteConfigOptions) {
    const res = await this.prepareAndGetValue(value, options);

    return res.asBoolean();
  }

  public async getNumber(value: string, options: RemoteConfigOptions) {
    const res = await this.prepareAndGetValue(value, options);

    return res.asNumber();
  }

  private async prepareAndGetAll(options: RemoteConfigOptions = {}) {
    if (options.defaults) {
      this.setDefaultValue(options.defaults);
    }

    if (options) {
      await this.setPropertiesOrSignals(options);
    }

    await this.fetch();

    return getAll(this.config);
  }

  public async getAllJSON<
    T extends Record<
      string,
      Record<string, string | number | boolean | object | null>
    >
  >(options?: RemoteConfigOptions) {
    const allValues = await this.prepareAndGetAll(options);
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(allValues)) {
      try {
        const configValue = value as RemoteConfigValue;
        const jsonValue = JSON.parse(configValue.asString() || "{}");
        if (
          typeof jsonValue === "object" &&
          jsonValue !== null &&
          !Array.isArray(jsonValue)
        ) {
          result[key] = jsonValue;
        }
      } catch {
        // Ignore parameters that are not valid JSON
      }
    }

    return result as T;
  }
}
