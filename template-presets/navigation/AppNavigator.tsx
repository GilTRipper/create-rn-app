import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { AppRoutes } from "./types";
import type { AppStackParamList } from "./types";

const AppStack = createNativeStackNavigator<AppStackParamList>();

export const AppNavigator = () => (
  <AppStack.Navigator>
    <AppStack.Screen name={AppRoutes.HOME} component={() => <View />} />
  </AppStack.Navigator>
);
