# Setup Instructions

After creating your project with `@giltripper/create-rn-app`, follow these steps to complete the setup:

## 1. Firebase Setup

### Android
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Add an Android app with your bundle identifier (e.g., `com.yourapp`)
4. Download `google-services.json`
5. Place it in `android/app/google-services.json`

### iOS
1. In the same Firebase project, add an iOS app
2. Download `GoogleService-Info.plist`
3. Place it in `ios/YourAppName/GoogleService-Info.plist`
4. Open Xcode and add it to your project

## 2. Google Maps Setup

### Android
1. Get your Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/)
2. Create or edit `android/local.properties`
3. Add: `GOOGLE_MAPS_API_KEY=your_actual_api_key_here`

### iOS
1. Open `ios/YourAppName/Info.plist`
2. Add your Google Maps API key (or it might be already configured via CocoaPods)

## 3. Install Dependencies

```bash
# Install npm packages
pnpm install
# or
npm install
# or
yarn install

# Install iOS pods
cd ios && pod install && cd ..
```

## 4. Environment Variables

Create a `.env` file in the root directory if you need environment-specific variables:

```
API_URL=https://your-api.com
```

## 5. Run the App

### iOS
```bash
pnpm run ios
# or
npm run ios
# or
yarn ios
```

### Android
```bash
pnpm run android
# or
npm run android
# or
yarn android
```

## Troubleshooting

### Android Build Errors
- Make sure you have added `google-services.json`
- Check that `GOOGLE_MAPS_API_KEY` is in `local.properties`
- Clean build: `cd android && ./gradlew clean && cd ..`

### iOS Build Errors
- Make sure you have added `GoogleService-Info.plist`
- Run `pod install` in the ios folder
- Clean build folder in Xcode: `Product > Clean Build Folder`

### Metro Bundler Issues
- Clear cache: `pnpm start --reset-cache`
- Delete `node_modules` and reinstall

## Features Included

- 🔥 Firebase (Analytics, Messaging, Remote Config)
- 🗺️ Google Maps with directions
- 🧭 React Navigation (Stack + Drawer)
- 🎨 React Native Reanimated
- 📦 MMKV for storage
- 🔔 Push Notifications (Notifee)
- 📷 Image Picker
- 🎭 Bottom Sheet
- And much more!

## Scripts

- `pnpm run android` - Run on Android
- `pnpm run ios` - Run on iOS
- `pnpm run start` - Start Metro bundler
- `pnpm run icons` - Generate app icons
- `pnpm run module` - Create a new module
- `pnpm run android:build` - Build Android release APK

## Documentation

For more information, check the README.md file.

