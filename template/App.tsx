import { BlurView as RNBlurView } from "@danielsaraldi/react-native-blur-view";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import notifee, { EventType } from "@notifee/react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import Geolocation from "@react-native-community/geolocation";
import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from "react-native";
import { Platform } from "react-native";
import { Dimensions } from "react-native";
import { Alert, Linking } from "react-native";
import BootSplash from "react-native-bootsplash";
import Config from "react-native-config";
import DatePicker from "react-native-date-picker";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import HapticFeedback from "react-native-haptic-feedback";
import { launchImageLibrary } from "react-native-image-picker";
import { KeyboardProvider } from "react-native-keyboard-controller";
import LinearGradient from "react-native-linear-gradient";
import LoaderKitView from "react-native-loader-kit";

import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { GradientText } from "./GradientText";
import type { BlurViewProps } from "@danielsaraldi/react-native-blur-view";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";

import type { GeolocationResponse } from "@react-native-community/geolocation";

const IS_IOS = Platform.OS === "ios";
export const useHandlePushNotifications = () => {
  const handleApnsMessages = () => {
    console.log("handleApnsMessages");
  };

  const handleFcmInitialMessage = async () => {
    const message = await notifee.getInitialNotification();
    if (message) {
      // notifications.handleFcmRemoteMessages(message.notification);
    }
  };

  const handleFcmOpenedApp = () => {
    notifee.onBackgroundEvent(async ({ type, detail: _detail }) => {
      if (type === EventType.PRESS) {
        // notifications.handleFcmRemoteMessages(detail.notification);
      }
    });
  };

  useEffect(() => {
    if (IS_IOS) {
      // PushNotificationIOS.getInitialNotification().then(handleApnsMessages);
    }
  }, []);

  useEffect(() => {
    if (IS_IOS) {
      // PushNotificationIOS.addEventListener("notification", handleApnsMessages);
    }
    return () => {
      if (IS_IOS) {
        // PushNotificationIOS.removeEventListener("notification");
      }
    };
  }, []);

  useEffect(() => {
    if (IS_IOS) {
      // PushNotificationIOS.addEventListener("localNotification", handleApnsMessages);
    }
    return () => {
      if (IS_IOS) {
        // PushNotificationIOS.removeEventListener("localNotification");
      }
    };
  }, []);

  useEffect(() => {
    if (IS_IOS) {
      // PushNotificationIOS.setApplicationIconBadgeNumber(0);
    }
  }, []);

  useEffect(() => {
    if (!IS_IOS) {
      handleFcmInitialMessage();
    }
  }, []);

  useEffect(() => {
    if (!IS_IOS) {
      handleFcmOpenedApp();
    }
  }, []);
};

const origin = { latitude: 37.3318456, longitude: -122.0296002 };
const destination = { latitude: 37.771707, longitude: -122.4053769 };

export const useLocation = () => {
  const handleError = () => {
    Alert.alert("App has no permission", "To see your location open Settings and give permission", [
      {
        text: "Open Settings",
        onPress: async () => await Linking.openSettings(),
      },
      {
        text: "Cancel",
        onPress: () => {},
      },
    ]);
  };

  const setLocationConfiguration = () => {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: false,
      authorizationLevel: "auto",
      enableBackgroundLocationUpdates: false,
      locationProvider: "auto",
    });
  };

  const requestLocationPermission = () =>
    new Promise<boolean>((resolve, reject) => {
      Geolocation.requestAuthorization(
        () => resolve(true),
        error => {
          console.error(error);
          reject(error);
        },
      );
    });
  const getCurrentLocation = async () =>
    new Promise<GeolocationResponse>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        pos => {
          resolve(pos);
        },
        error => {
          console.error(error);
          reject(error);
        },
      );
    });
  const getPosition = async () => {
    try {
      const position = await getCurrentLocation();
      return position;
    } catch (error) {
      console.error(error);
      handleError();
    }
  };

  console.log("Config", Config.API_URL);

  type LatLng = { latitude: number; longitude: number };

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  function getGeodesicMidpoint(points: LatLng[]): LatLng | null {
    if (points.length === 0) {
      return null;
    }

    if (points.length === 1) {
      return points[0];
    }

    // Convert all points to Cartesian coordinates
    let x = 0;
    let y = 0;
    let z = 0;

    for (const point of points) {
      const φ = toRad(point.latitude);
      const λ = toRad(point.longitude);

      x += Math.cos(φ) * Math.cos(λ);
      y += Math.cos(φ) * Math.sin(λ);
      z += Math.sin(φ);
    }

    // Calculate average
    const total = points.length;
    x /= total;
    y /= total;
    z /= total;

    // Convert back to geographic coordinates
    const λm = Math.atan2(y, x);
    const hyp = Math.sqrt(x * x + y * y);
    const φm = Math.atan2(z, hyp);

    return { latitude: toDeg(φm), longitude: toDeg(λm) };
  }
  return {
    getPosition,
    getCurrentLocation,
    setLocationConfiguration,
    requestLocationPermission,
    getGeodesicMidpoint,
  };
};
export const BlurView: React.FC<BlurViewProps> = ({ style, ...props }) => {
  const scheme = useColorScheme();
  if (Platform.OS === "android") {
    return <RNBlurView type={scheme === "dark" ? "light" : "dark"} style={[style]} radius={10} {...props} />;
  }

  return <RNBlurView type={scheme === "dark" ? "light" : "dark"} style={[style]} radius={10} {...props} />;
};

export const App = () => {
  const isDarkMode = useColorScheme() === "dark";

  useEffect(() => {
    BootSplash.hide({ fade: true });
  }, []);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
        <AppContent />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
};
export const darkStyle = [
  {
    stylers: [
      {
        hue: "#ff1a00",
      },
      {
        invert_lightness: true,
      },
      {
        saturation: -100,
      },
      {
        lightness: 33,
      },
      {
        gamma: 0.5,
      },
    ],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [
      {
        color: "#323334",
      },
    ],
  },
];

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();

  const handleSheetChanges = useCallback((index: number) => {
    console.log("index", index);
  }, []);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const openModal = () => {
    setIsModalVisible(true);
  };
  const closeModal = () => {
    setIsModalVisible(false);
  };
  // Добавляем snapPoints - обязательный проп!
  const snapPoints = useMemo(() => ["25%", "50%", "90%"], []);
  const netInfo = useNetInfo();
  console.log("netInfo", netInfo);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        onPress={() => {
          bottomSheetRef.current?.close?.();
        }}
      />
    ),
    [],
  );

  const handleCopy = () => {
    HapticFeedback.trigger("selection");
    Clipboard.setString("Text to copy");
  };
  const openMedia = async () => {
    await launchImageLibrary(
      {
        mediaType: "photo",
      },
      (response: any) => {
        console.log("response", response);
      },
    );
  };

  const openBottomSheet = () => {
    bottomSheetRef.current?.expand?.();
  };

  const location = useLocation();
  useEffect(() => {
    location.setLocationConfiguration();
    location.requestLocationPermission().then(permission => {
      console.log("permission", permission);
    });
  }, []);

  // return (
  //   <MapView
  //     provider={PROVIDER_GOOGLE}
  //     style={styles.map}
  //     customMapStyle={darkStyle}
  //     initialRegion={{
  //       latitude: 55.7558, // Москва
  //       longitude: 37.6173,
  //       latitudeDelta: 0.0922,
  //       longitudeDelta: 0.0421,
  //     }}
  //     onPanDrag={() => {}}
  //   >
  //     <MapViewDirections
  //       origin={origin}
  //       destination={destination}
  //       apikey={GOOGLE_MAPS_APIKEY}
  //       strokeColor="hotpink"
  //       strokeWidth={2}
  //     />
  //   </MapView>
  // );
  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView>
        <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
          <Text>Hello World</Text>
          <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
            <Text>Text to copy</Text>
          </TouchableOpacity>
          <TextInput style={styles.input} placeholder="Enter copied text" />
          <BlurView targetId="id" style={styles.blurView} />
          <TouchableOpacity onPress={openMedia}>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              colors={["#4c669f", "#3b5998", "#192f6a"]}
              style={styles.linearGradient}
            >
              <Text style={styles.buttonText}>Select Image</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={openBottomSheet}>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              colors={["#4c669f", "#3b5998", "#192f6a"]}
              style={styles.linearGradient}
            >
              <Text style={styles.buttonText}>Open Bottom Sheet</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={openModal}>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              colors={["#4c669f", "#3b5998", "#192f6a"]}
              style={styles.linearGradient}
            >
              <Text style={styles.buttonText}>Open Modal</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              colors={["#4c669f", "#3b5998", "#192f6a"]}
              style={styles.linearGradient}
            >
              <LoaderKitView
                style={{ width: 50, height: 40, alignSelf: "center" }}
                name={"BallPulse"}
                animationSpeedMultiplier={1.0} // speed up/slow down animation, default: 1.0, larger is faster
                color={"white"} // Optional: color can be: 'red', 'green',... or '#ddd', '#ffffff',...
              />
            </LinearGradient>
          </TouchableOpacity>
          <GradientText style={styles.text} colors={["#4c669f", "#3b5998", "red"]}>
            Hello World
          </GradientText>
          <DatePicker
            date={new Date()}
            onDateChange={(date: Date) => {
              console.log("date", date);
            }}
            mode="date"
            style={styles.datePicker}
          />
        </View>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          backdropComponent={renderBackdrop}
          onChange={handleSheetChanges}
          enablePanDownToClose={true}
          enableContentPanningGesture={true}
          enableHandlePanningGesture={true}
        >
          <BottomSheetView style={styles.contentContainer}>
            <View style={styles.sheetContent}>
              <Text>Bottom Sheet Content</Text>
            </View>
          </BottomSheetView>
        </BottomSheet>
        <Modal animationType="fade" visible={isModalVisible}>
          <View style={{ paddingTop: safeAreaInsets.top }}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={[styles.buttonText, { color: "black", alignSelf: "flex-end" }]}>Close Modal</Text>
            </TouchableOpacity>
          </View>
          <WebView source={{ uri: "https://www.google.com" }} />
        </Modal>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 16,
  },
  map: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  sheetContent: {
    height: 200,
    backgroundColor: "red",
  },
  copyButton: {
    padding: 16,
    backgroundColor: "blue",
    borderRadius: 8,
  },
  input: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  blurView: {
    width: "100%",
    height: 100,
  },
  linearGradient: {
    paddingLeft: 15,
    paddingRight: 15,
    borderRadius: 5,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "Gill Sans",
    textAlign: "center",
    margin: 10,
    color: "#ffffff",
    backgroundColor: "transparent",
  },
  datePicker: {
    width: Dimensions.get("screen").width,
    height: 100,
  },
  text: {
    fontSize: 18,
    fontFamily: "Gill Sans",
    textAlign: "center",
    margin: 10,
  },
});
