import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AppNavigator } from "./AppNavigator";
import { AuthNavigator } from "./AuthNavigator";
import { RootRoutes } from "./types";
import { useIsAuthorized } from "~/auth";
import type { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  const authorized = useIsAuthorized();

  return (
    <RootStack.Navigator>
      {authorized ? (
        <RootStack.Screen name={RootRoutes.APP} component={AppNavigator} />
      ) : (
        <RootStack.Screen name={RootRoutes.AUTH} component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
};
