export const AnalyticsEvents = {
  SCREEN_VIEW: "screen_view",
  OPEN_RESTAURANT: "open_restaurant",
  OPEN_PRODUCT: "open_product",
};

export type AnalyticsEvent = keyof typeof AnalyticsEvents;
