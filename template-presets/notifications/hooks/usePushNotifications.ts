import { useMemo } from "react";
import { PushNotificationService } from "../service";

export const usePushNotifications = () => {
  return useMemo(() => new PushNotificationService(), []);
};

