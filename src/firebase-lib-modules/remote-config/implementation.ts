import {
  getRemoteConfig,
  setCustomSignals,
} from "@react-native-firebase/remote-config";

import type { Analytics } from "~/lib/analytics/implementation";
import type { FirebaseRemoteConfigTypes } from "@react-native-firebase/remote-config";

import type { ReactNativeFirebase } from "@react-native-firebase/app";
import type { RemoteConfigInterface } from "./interface";
import type { RemoteConfigOptions } from "./types";

export class RemoteConfig implements RemoteConfigInterface {
  private config: FirebaseRemoteConfigTypes.Module;
  private analytics?: Analytics;

  public constructor(
    app: ReactNativeFirebase.FirebaseApp,
    analytics?: Analytics
  ) {
    if (analytics) {
      this.analytics = analytics;
    }

    this.config = getRemoteConfig(app);
  }

  private async fetch() {
    await this.config.fetch(0);
    await this.config.fetchAndActivate();
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

  private async setDefaultValue(
    defaults: Record<string, string | number | boolean>
  ) {
    await this.config.setDefaults(defaults);
  }

  private async prepareAndGetValue(
    value: string,
    options: RemoteConfigOptions = {}
  ) {
    if (options.defaults) {
      await this.setDefaultValue(options.defaults);
    }

    if (options) {
      await this.setPropertiesOrSignals(options);
    }

    await this.fetch();

    const result = this.config.getValue(value);

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
}
