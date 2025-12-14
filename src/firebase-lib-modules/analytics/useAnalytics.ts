import { useMemo } from "react";
import { getApp } from "@react-native-firebase/app";
import { Analytics } from "./implementation";

export const useAnalytics = () => {
  const analytics = useMemo(() => {
    const app = getApp();
    return new Analytics(app);
  }, []);

  return analytics;
};
