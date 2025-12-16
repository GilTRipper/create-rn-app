import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { AuthRoutes } from "./types";
import type { AuthStackParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator = () => (
  <AuthStack.Navigator>
    <AuthStack.Screen name={AuthRoutes.LOGIN} component={() => <View />} />
    <AuthStack.Screen name={AuthRoutes.REGISTER} component={() => <View />} />
  </AuthStack.Navigator>
);
