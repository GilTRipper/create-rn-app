import { PermissionsAndroid, Platform } from "react-native";
import {
  getAPNSToken,
  getMessaging,
  getToken,
  hasPermission,
  requestPermission,
} from "@react-native-firebase/messaging";
import { DeviceInfoModule } from "react-native-nitro-device-info";
import type { IPushNotifications } from "./interface";

export class PushNotificationService implements IPushNotifications {
  public constructor(private messaging = getMessaging()) {}

  public async requestPermission(): Promise<void> {
    const ANDROID_VERSION = Number(DeviceInfoModule.systemVersion);
    if (Platform.OS === "ios" || ANDROID_VERSION < 13) {
      await requestPermission(this.messaging);
    } else {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
  }

  public async checkPermission(): Promise<boolean> {
    const ANDROID_VERSION = Number(DeviceInfoModule.systemVersion);
    if (Platform.OS === "ios" || ANDROID_VERSION < 13) {
      const status = await hasPermission(this.messaging);
      return status > 0;
    }

    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  }

  private async getTokenIOS() {
    const token = await getAPNSToken(this.messaging);
    return token || "";
  }

  private async getTokenAndroid() {
    const token = await getToken(this.messaging);
    return token || "";
  }

  public async getPushToken(): Promise<string> {
    return Platform.OS === "ios" ? this.getTokenIOS() : this.getTokenAndroid();
  }
}

