import React from "react";
import { StyleSheet, View, useColorScheme } from "react-native";
import BaseTurboImage from "react-native-turbo-image";

import type { ComponentProps } from "react";

type BaseTurboImageProps = ComponentProps<typeof BaseTurboImage>;

type PropsType = {
  uri?: string | null;
  cacheKey?: string;
  placeholderCacheKey?: string;
  resizeMode?: BaseTurboImageProps["resizeMode"];
  onLoaded?: (size?: { width: number; height: number }) => void;
  onError?: () => void;
};

export const TurboImage: React.FC<PropsType & Omit<BaseTurboImageProps, "source">> = ({
  uri,
  cacheKey,
  placeholderCacheKey,
  resizeMode = "cover",
  style,
  onLoaded,
  onError,
  ...props
}) => {
  const scheme = useColorScheme();
  const placeholderStyle = scheme === "dark" ? styles.coverPlaceholderDark : styles.coverPlaceholderLight;

  return (
    <View style={[placeholderStyle, style]}>
      <BaseTurboImage
        source={{ uri: uri ?? "", cacheKey }}
        style={style}
        cachePolicy="dataCache"
        placeholder={placeholderCacheKey ? { memoryCacheKey: placeholderCacheKey } : undefined}
        resizeMode={resizeMode}
        {...props}
        onFailure={e => {
          console.log("LOAD TURBO IMAGE ERROR:", e.nativeEvent.error);
          onError?.();
          props?.onFailure?.(e);
        }}
        onSuccess={e => {
          onLoaded?.({ width: e.nativeEvent.width, height: e.nativeEvent.height });
          props?.onSuccess?.(e);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  coverPlaceholderLight: {
    backgroundColor: "#F2F2F7",
  },
  coverPlaceholderDark: {
    backgroundColor: "#1C1C1E",
  },
});
