import type { RouteProp } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

export const enum RootRoutes {
  APP = "APP",
  AUTH = "AUTH",
}

export type RootStackParamList = {
  [RootRoutes.APP]: undefined;
  [RootRoutes.AUTH]: undefined;
};

export const enum AppRoutes {
  HOME = "HOME",
}

export type AppStackParamList = {
  [AppRoutes.HOME]: undefined;
};

export const enum AuthRoutes {
  LOGIN = "LOGIN",
  REGISTER = "REGISTER",
}

export type AuthStackParamList = {
  [AuthRoutes.LOGIN]: undefined;
  [AuthRoutes.REGISTER]: undefined;
};

export type AuthStackScreenProps<
  T extends keyof AuthStackParamList = AuthRoutes
> = NativeStackScreenProps<AuthStackParamList, T>;
export type AuthStackNavigationProp<
  T extends keyof AuthStackParamList = AuthRoutes
> = NativeStackNavigationProp<AuthStackParamList, T>;
export type AuthStackRouteProp<
  T extends keyof AuthStackParamList = AuthRoutes
> = RouteProp<AuthStackParamList, T>;

export type AppStackRouteProp<T extends keyof AppStackParamList = AppRoutes> =
  RouteProp<AppStackParamList, T>;
export type AppStackScreenProps<T extends keyof AppStackParamList = AppRoutes> =
  NativeStackScreenProps<AppStackParamList, T>;
export type AppStackNavigationProp<
  T extends keyof AppStackParamList = AppRoutes
> = NativeStackNavigationProp<AppStackParamList, T>;
