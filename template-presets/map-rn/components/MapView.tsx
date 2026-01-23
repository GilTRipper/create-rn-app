import React from "react";
import { StyleSheet } from "react-native";
import NativeMapView, { PROVIDER_GOOGLE } from "react-native-maps";
import type { MapViewProps as NativeMapViewProps } from "react-native-maps";
import type { ForwardedRef, PropsWithChildren } from "react";

type MapViewProps = {
  renderBottomContent?: () => React.ReactNode;
} & NativeMapViewProps;

export const MapView = React.forwardRef<NativeMapView, PropsWithChildren<MapViewProps>>(
  ({ renderBottomContent, children, ...props }, ref: ForwardedRef<NativeMapView>) => {
    return (
      <>
        <NativeMapView
          provider={PROVIDER_GOOGLE}
          ref={ref}
          style={styles.map}
          {...props}
        >
          {children}
        </NativeMapView>
        {renderBottomContent?.()}
      </>
    );
  },
);

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
