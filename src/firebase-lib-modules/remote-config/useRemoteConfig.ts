import { useMemo } from "react";
import { getApp } from "@react-native-firebase/app";
import { RemoteConfig } from "~/lib/remote-config/implementation";
import { useAnalytics } from "~/lib/analytics";

export const useRemoteConfig = () => {
  const analytics = useAnalytics();

  const remoteConfig = useMemo(() => {
    const app = getApp();
    return new RemoteConfig(app, analytics);
  }, [analytics]);

  return remoteConfig;
};
