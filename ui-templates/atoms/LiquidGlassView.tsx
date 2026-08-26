import { LiquidGlassView as LiquidGlassViewComponent } from "@callstack/liquid-glass";
import Animated from "react-native-reanimated";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";

import type { LiquidGlassViewProps } from "@callstack/liquid-glass";
import type { FC } from "react";
import type { ColorSchemeName, StyleProp, ViewStyle } from "react-native";

const AnimatedLiquidGlassViewComponent = Animated.createAnimatedComponent(LiquidGlassViewComponent);

type Props = LiquidGlassViewProps & { contentStyle?: StyleProp<ViewStyle> };

const androidFallbackStyle = (scheme: ColorSchemeName) => [
  styles.container,
  scheme === "dark" ? styles.containerDark : styles.containerLight,
];

export const LiquidGlassView: FC<Props> = ({ style, contentStyle, children, ...props }) => {
  const scheme = useColorScheme();

  if (Platform.OS === "android") {
    return (
      <View style={[androidFallbackStyle(scheme), contentStyle, style]} {...props}>
        {children}
      </View>
    );
  }

  return (
    <LiquidGlassViewComponent style={style} {...props}>
      {children}
    </LiquidGlassViewComponent>
  );
};

export const AnimatedLiquidGlassView: FC<Props> = ({ style, contentStyle, children, ...props }) => {
  const scheme = useColorScheme();

  if (Platform.OS === "android") {
    return (
      <Animated.View style={[androidFallbackStyle(scheme), contentStyle, style]} {...props}>
        {children}
      </Animated.View>
    );
  }

  return (
    <AnimatedLiquidGlassViewComponent style={style} {...props}>
      {children}
    </AnimatedLiquidGlassViewComponent>
  );
};

const styles = StyleSheet.create({
  container: {
    // Android fallback is deliberately opaque: native blur can intercept presses.
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  containerLight: {
    backgroundColor: "#F2F2F7",
    borderColor: "#C6C6C8",
  },
  containerDark: {
    backgroundColor: "#1C1C1E",
    borderColor: "#38383A",
  },
});
