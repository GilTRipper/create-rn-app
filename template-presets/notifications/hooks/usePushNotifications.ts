import { useMemo } from "react";
import { PushNotificationService } from "~/notifications/service";

export const usePushNotifications = () => useMemo(() => new PushNotificationService(), []);

