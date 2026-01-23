import { StyleSheet } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { StyleURL } from "@rnmapbox/maps";
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { ForwardedRef, PropsWithChildren } from "react";

type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  styleURL?: StyleURL;
  scaleBarEnabled?: boolean;
  compassEnabled?: boolean;
  flex?: boolean;
};

export const MapView = React.forwardRef<Mapbox.MapView, PropsWithChildren<MapViewProps>>(
  (
    { flex = true, style, styleURL: defaultStyleURL, scaleBarEnabled = false, compassEnabled = false, children },
    ref: ForwardedRef<Mapbox.MapView>,
  ) => {
    const styleURL = defaultStyleURL || StyleURL.Light;
    return (
      <Mapbox.MapView
        ref={ref}
        style={[flex && styles.flex, style]}
        styleURL={styleURL}
        scaleBarEnabled={scaleBarEnabled}
        compassEnabled={compassEnabled}
        logoEnabled={false}
        attributionEnabled={false}
      >
        {children}
      </Mapbox.MapView>
    );
  },
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
