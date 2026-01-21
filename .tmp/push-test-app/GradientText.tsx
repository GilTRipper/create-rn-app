import React from "react";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { TextProps } from "react-native";

type PropsType = {
  colors: string[];
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const GradientText: React.FC<PropsType & TextProps> = ({
  colors,
  children,
  style,
  ...props
}) => (
  <View style={{ flexDirection: "row" }}>
    <MaskedView
      maskElement={
        <Text style={[style, styles.transparent]} {...props}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={[style, styles.opacityZero]} {...props}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  </View>
);

const styles = StyleSheet.create({
  transparent: {
    backgroundColor: "transparent",
  },
  opacityZero: {
    opacity: 0,
  },
});
