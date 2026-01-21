import { useCallback, useState } from "react";
import { usePushNotifications } from "./usePushNotifications";

export const useHandlePushNotificationToken = () => {
  const notifications = usePushNotifications();
  const [pushToken, setPushToken] = useState<string>("");

  const setNotifications = useCallback(async () => {
    try {
      await notifications.requestPermission();
      const granted = await notifications.checkPermission();
      if (!granted) return;

      const token = await notifications.getPushToken();
      if (!token) return;

      setPushToken(token);
      console.info("[RECEIVED PUSH TOKEN]:", { token });
    } catch (error) {
      console.error("[SET NOTIFICATIONS ERROR]: ", error);
    }
  }, [notifications]);

  return { setNotifications, pushToken };
};

