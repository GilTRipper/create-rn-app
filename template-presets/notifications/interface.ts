export interface IPushNotifications {
  requestPermission(): Promise<void>;
  checkPermission(): Promise<boolean>;
  getPushToken(): Promise<string>;
}

