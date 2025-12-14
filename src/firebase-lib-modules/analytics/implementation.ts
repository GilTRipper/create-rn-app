import { getAnalytics } from "@react-native-firebase/analytics";
import { AnalyticsEvents, type AnalyticsEvent } from "./types";
import type { FirebaseAnalyticsTypes } from "@react-native-firebase/analytics";
import type { ReactNativeFirebase } from "@react-native-firebase/app";
import type { AnalyticsInterface } from "./interface";

export class Analytics implements AnalyticsInterface {
  private analytics: FirebaseAnalyticsTypes.Module;

  public constructor(app: ReactNativeFirebase.FirebaseApp) {
    this.analytics = getAnalytics(app);
  }

  public async logEvent(
    name: AnalyticsEvent,
    params?: Record<string, unknown>
  ): Promise<void> {
    await this.analytics.logEvent(AnalyticsEvents[name], params);
  }

  public async setUserProperty(
    name: string,
    value: string | null
  ): Promise<void> {
    await this.analytics.setUserProperty(name, value);
  }

  public async setUserProperties(
    properties: Record<string, string | null>
  ): Promise<void> {
    await this.analytics.setUserProperties(properties);
  }

  public async setUserId(id: string | null): Promise<void> {
    await this.analytics.setUserId(id);
  }
}
