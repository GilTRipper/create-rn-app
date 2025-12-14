export interface AnalyticsInterface {
  logEvent(name: string, params: Record<string, unknown>): Promise<void>;
  setUserProperty(name: string, value: string | null): Promise<void>;
  setUserProperties(properties: Record<string, string | null>): Promise<void>;
  setUserId(id: string | null): Promise<void>;
}
