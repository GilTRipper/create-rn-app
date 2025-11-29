# HelloWorld

A React Native application built with @giltripper/create-rn-app.

## Getting Started

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Quick Start

1. Install dependencies:
```bash
pnpm install
cd ios && pod install && cd ..
```

2. Setup Firebase (see SETUP.md)

3. Setup Google Maps (see SETUP.md)

4. Run the app:
```bash
# iOS
pnpm run ios

# Android
pnpm run android
```

## Tech Stack

- React Native 0.82
- TypeScript
- Firebase (Analytics, Messaging, Remote Config)
- Google Maps
- React Navigation
- Zustand for state management
- TanStack Query for API calls
- MMKV for storage
- Notifee for push notifications
- And more...

## Project Structure

```
├── android/          # Android native code
├── ios/              # iOS native code
├── assets/           # Images, fonts, icons
├── src/              # Application source code
├── scripts/          # Utility scripts
└── patches/          # Package patches
```

## Available Scripts

- `pnpm run android` - Run on Android device/emulator
- `pnpm run ios` - Run on iOS device/simulator
- `pnpm run start` - Start Metro bundler
- `pnpm run icons` - Generate app icons from source
- `pnpm run module` - Scaffold a new module
- `pnpm run android:build` - Build Android release APK

## Documentation

For setup instructions, see [SETUP.md](./SETUP.md).

## License

Private
