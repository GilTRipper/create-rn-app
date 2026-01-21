# Setup Instructions

After creating your project with `@giltripper/create-rn-app`, follow these steps to complete the setup:

## 1. Firebase (optional)

If you selected Firebase during project creation, we already hooked up the Google Services files for the environments you provided. Double-check they exist:

- Android: `android/app/google-services.json` (and `android/app/src/<env>/google-services.json` for extra envs)
- iOS: `ios/<YourAppName>/GoogleService-Info.plist` (and `ios/GoogleServices/<env>/GoogleService-Info.plist` for extra envs)

If you skipped Firebase, you can re-run the generator and enable it later.

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
- If using Firebase, verify `google-services.json` is present
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

