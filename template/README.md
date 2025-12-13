#  React Native Sample Project 

A professional React Native sample project demonstrating modern mobile development practices with Firebase integration, Google Maps, and comprehensive navigation.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Customization](#customization)
  - [Changing App Icon](#changing-app-icon)
  - [Changing Splash Screen](#changing-splash-screen)
- [Applied Patches](#applied-patches)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
  - [Root Imports Configuration](#root-imports-configuration)
- [Key Dependencies](#key-dependencies)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This is a sample React Native project showcasing:
- Modern React Native architecture (0.82.1 with React 19.1.1)
- Firebase integration (Analytics, Messaging, Remote Config)
- Google Maps with directions
- Custom splash screen and icons
- Advanced navigation patterns
- State management with Zustand
- Type-safe development with TypeScript

**Note**: This project serves as a template for starting new React Native applications with a solid foundation and best practices.

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20 or higher
- **pnpm**: This project uses pnpm as the package manager
  ```bash
  npm install -g pnpm
  ```
- **React Native CLI**: For running the app
  ```bash
  npm install -g react-native-cli
  ```
- **Xcode**: Version 14+ (for iOS development)
- **Android Studio**: Latest version (for Android development)
- **CocoaPods**: For iOS dependencies
  ```bash
  sudo gem install cocoapods
  ```

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd trofimobile
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Install iOS pods**
   ```bash
   cd ios
   pod install
   cd ..
   ```

4. **Configure Firebase**
   - Place your `google-services.json` in `android/app/`
   - Place your `GoogleService-Info.plist` in `ios/`

5. **Configure environment variables**
   - Create a `.env` file in the project root (see [Environment Variables](#environment-variables) section below)
   - Add your API keys and configuration values

## ⚙️ Environment Variables

This project uses **`react-native-config`** for managing environment variables.

### Setup

1. **Create `.env` file** in the project root:

```bash
# API Configuration
API_URL=https://api.example.com
API_TIMEOUT=30000

# Firebase (if not using google-services.json)
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_PROJECT_ID=your_project_id

# New Relic (Optional - remove if not using)
NEW_RELIC_ANDROID_KEY=your_android_key
NEW_RELIC_IOS_KEY=your_ios_key

# Google Maps
GOOGLE_MAPS_API_KEY_ANDROID=your_android_maps_key
GOOGLE_MAPS_API_KEY_IOS=your_ios_maps_key

# Other Services
SENTRY_DSN=your_sentry_dsn
APP_ENV=development
```

2. **Create environment-specific files** (optional):
   - `.env.development` - Development environment
   - `.env.staging` - Staging environment
   - `.env.production` - Production environment

### Usage in Code

```typescript
import Config from 'react-native-config';

// Access environment variables
const apiUrl = Config.API_URL;
const timeout = Config.API_TIMEOUT;
const mapsKey = Config.GOOGLE_MAPS_API_KEY_ANDROID;
```

### Usage Example (from index.js)

```typescript
import Config from 'react-native-config';
import { Platform } from 'react-native';

// Get platform-specific keys
const apiKey = Platform.OS === 'ios' 
  ? Config.NEW_RELIC_IOS_KEY 
  : Config.NEW_RELIC_ANDROID_KEY;
```

### Building with Different Environments

```bash
# iOS
ENVFILE=.env.production react-native run-ios

# Android
ENVFILE=.env.production react-native run-android
```

### Important Notes

- **Never commit** `.env` files to version control
- Add `.env*` to `.gitignore`
- Create `.env.example` with dummy values for team reference
- After changing `.env`, clean and rebuild:
  ```bash
  # iOS
  cd ios && pod install && cd ..
  
  # Android
  cd android && ./gradlew clean && cd ..
  ```

## 🏃 Running the App

### iOS

```bash
# Start Metro bundler
pnpm start

# In another terminal, run iOS
pnpm ios

# Or specify a simulator
react-native run-ios --simulator="iPhone 15 Pro"
```

### Android

```bash
# Start Metro bundler
pnpm start

# In another terminal, run Android
pnpm android

# Or with debug mode for Firebase Analytics
pnpm android:debug
```

## 🎨 Customization

### Changing App Icon

This project includes a script to generate icons for both platforms:

1. **Prepare your icon**
   - Create a PNG image (preferably 1024x1024px)
   - Save it in the `assets/` directory

2. **Generate icons**
   ```bash
   pnpm icons
   ```

3. **Manual generation (if needed)**
   - For iOS: Replace icons in `ios/trofimobile/Images.xcassets/AppIcon.appiconset/`
   - For Android: Replace icons in `android/app/src/main/res/mipmap-*/`
   - Use tools like [makeappicon.com](https://makeappicon.com) or [appicon.co](https://appicon.co)

### Changing Splash Screen

The project uses `react-native-bootsplash` for splash screens:

1. **Prepare your logo**
   - Create a PNG image (recommended size: 1000x1000px)
   - Keep it simple as it will be displayed on various screen sizes

2. **Generate splash screen**
   ```bash
   npx react-native generate-bootsplash assets/bootsplash/logo.png \
     --background-color=FFFFFF \
     --logo-width=100 \
     --assets-path=assets/bootsplash \
     --flavor=main
   ```

3. **Assets location**
   - Splash screen assets are stored in `assets/bootsplash/`
   - The manifest file contains all generated variations

## 🔧 Applied Patches

This project uses `pnpm` patch feature to fix compatibility issues with certain dependencies. Patches are automatically applied during `pnpm install`.

### 1. @gorhom/bottom-sheet@5.2.6

**Purpose**: Fixes React Native compatibility issues with bounding client rect checks.

**Changes**:
- Fixed null checks for `getBoundingClientRect` and `unstable_getBoundingClientRect`
- Changed from `!== null` to `typeof === "function"` checks
- Ensures compatibility with React Native's Fabric renderer

**Files affected**:
- `lib/commonjs/hooks/useBoundingClientRect.js`
- `lib/module/hooks/useBoundingClientRect.js`
- `src/hooks/useBoundingClientRect.ts`

### 2. @react-native-community/netinfo@11.4.1

**Purpose**: Adds support for React Native's New Architecture (TurboModules).

**Changes**:
- Implemented TurboModule support for both iOS and Android
- Split module implementation into old/new architecture paths
- Updated Android build configuration for TurboModules
- Added codegen configuration
- Created separate implementations for `oldarch` and `newarch`

**Files affected**:
- Android: Build configuration, module implementation split
- iOS: Added `.mm` implementation with TurboModule support
- Package.json: Added codegen configuration

### 3. react-native-date-picker@5.0.13

**Purpose**: Adds New Architecture (TurboModules) support for the date picker.

**Changes**:
- Added TurboModule protocol implementation for iOS
- Implemented `getTurboModule` method for new architecture
- Added `requiresMainQueueSetup` method
- Maintains backward compatibility with old architecture

**Files affected**:
- `ios/RNDatePickerManager.h`
- `ios/RNDatePickerManager.mm`

### Why These Patches?

These patches are necessary because:
1. The libraries haven't released official updates with these fixes
2. They enable compatibility with React Native's latest features
3. They fix runtime crashes and improve stability
4. They prepare the app for the New Architecture migration

**Note**: When updating these dependencies, verify if official versions include these fixes to potentially remove patches.

## 📜 Available Scripts

```bash
# Development
pnpm start              # Start Metro bundler
pnpm android            # Run on Android
pnpm android:debug      # Run Android with Firebase Analytics debug mode
pnpm ios                # Run on iOS

# Build
pnpm android:build      # Build Android release APK

# Utilities
pnpm icons              # Generate app icons
pnpm module             # Create a new module (custom script)
pnpm codegen            # Generate API client with Orval
```

## 📁 Project Structure

```
trofimobile/
├── android/                 # Android native code
├── ios/                     # iOS native code
├── src/                     # Source code (organize your code here)
├── assets/                  # Images, fonts, icons
│   ├── bootsplash/         # Splash screen assets
│   ├── fonts/              # Custom fonts (Golos Text, Tajawal, Urbanist)
│   └── icons/              # App icons
├── patches/                # pnpm patches for dependencies
├── scripts/                # Utility scripts
│   ├── create-module.js    # Module generator
│   └── generate-icons.js   # Icon generator
├── App.tsx                 # Root component
├── index.js               # App entry point
└── package.json           # Dependencies and scripts
```

### Root Imports Configuration

This project is configured with **absolute imports** using the `~` prefix, allowing you to import modules from the `src/` directory without relative paths.

**Configuration:**

```javascript
// babel.config.js
{
  "babel-plugin-root-import": {
    "rootPathPrefix": "~",
    "rootPathSuffix": "./src"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "~/*": ["*"]
    }
  }
}
```

**Usage Example:**

Instead of relative imports:
```typescript
import { Button } from '../../../components/Button';
import { useAuth } from '../../hooks/useAuth';
```

Use absolute imports:
```typescript
import { Button } from '~/components/Button';
import { useAuth } from '~/hooks/useAuth';
```

**Benefits:**
- Cleaner imports
- No need to count `../` levels
- Easier refactoring
- Better code organization

**Project `src/` structure (Feature-based):**
```
src/
├── [feature-modules]/   # Feature modules (auth, cart, orders, checkout, etc.)
├── lib/                 # Shared libraries & core infrastructure
│   ├── api/             # API client & HTTP services
│   ├── config/          # App configuration & env settings
│   ├── remote-config/   # Firebase Remote Config
│   ├── analytics/       # Analytics tracking (Firebase, custom events)
│   ├── hooks/           # Shared React hooks
│   ├── localization/    # i18n & translations
│   ├── location/        # Geolocation services
│   ├── storage/         # Persistent storage (MMKV)
│   ├── theme/           # Theme management
│   ├── utils/           # Utility functions & helpers
│   ├── mocks/           # Mock data for testing
│   ├── files/           # File handling utilities
│   ├── update/          # App update logic
│   ├── styles/          # Global styles
│   ├── haptics.ts       # Haptic feedback wrapper
│   ├── image.ts         # Image utilities & optimization
│   ├── permissions.ts   # Permission handling (camera, location, etc.)
│   ├── storage.ts       # Storage wrapper (MMKV)
│   └── time.ts          # Time/date utilities & formatters
├── ui/                  # UI components & design system
│   ├── components/      # Reusable components
│   │   ├── analytics/   # Analytics components
│   │   ├── atoms/       # Basic UI elements (Atomic Design)
│   │   ├── moleculas/   # Composite components
│   │   └── organisms/   # Complex components
│   └── constants/       # Design tokens
│       ├── colors.ts    # Color palette
│       ├── gradients.ts # Gradient definitions
│       ├── icons.ts     # Icon mappings
│       ├── insets.ts    # Spacing & insets
│       ├── layout.ts    # Layout constants
│       ├── themes.ts    # Theme configuration
│       └── index.ts     # Exports
└── navigation/          # Navigation configuration
    ├── components/      # Navigation components
    ├── AuthNavigator.tsx    # Auth flow navigation
    ├── DrawerNavigator.tsx  # Drawer navigation
    ├── RootNavigator.tsx    # Root navigator
    ├── types.ts         # Navigation types
    └── index.tsx        # Navigation exports
```

**Key Infrastructure (`lib/` folder):**
- **`api/`** - Axios instance, interceptors, API endpoints, request/response transformers
- **`config/`** - Environment configuration, feature flags, build configs
- **`remote-config/`** - Firebase Remote Config setup, feature toggles
- **`analytics/`** - Event tracking, Firebase Analytics integration
- **`storage/`** - MMKV storage wrapper, cache management, secure storage
- **`localization/`** - i18n setup, language switching, translation helpers
- **`hooks/`** - Shared custom hooks (useDebounce, useAsync, usePermissions, etc.)
- **`utils/`** - Pure functions, data transformers, formatters
- **`permissions.ts`** - Runtime permissions handling (iOS & Android)
- **`haptics.ts`** - Haptic feedback for user interactions
- **`time.ts`** - Date formatting, timezone utilities, dayjs wrappers

**Architecture Pattern:**
- **Feature-based structure**: Each feature (cart, auth, orders, etc.) is self-contained
- **Atomic Design**: UI components organized as atoms → molecules → organisms
- **Centralized navigation**: All navigators in dedicated folder
- **Design system**: Shared constants for colors, themes, layouts

## 🔑 Key Dependencies

### Core
- **React**: 19.1.1
- **React Native**: 0.82.1
- **TypeScript**: 5.8.3

### Navigation
- **@react-navigation/native**: Stack and drawer navigation
- **react-native-screens**: Native screen optimization

### State Management
- **Zustand**: Lightweight state management
- **@tanstack/react-query**: Server state management

### UI Components
- **@gorhom/bottom-sheet**: Native bottom sheets
- **react-native-reanimated**: Smooth animations
- **react-native-gesture-handler**: Touch gestures

### Maps & Location
- **react-native-maps**: Google Maps integration
- **react-native-maps-directions**: Route directions
- **@react-native-community/geolocation**: Device location

### Utilities
- **axios**: HTTP client
- **dayjs**: Date manipulation
- **lodash**: Utility functions
- **react-native-mmkv**: Fast key-value storage
- **react-native-config**: Environment configuration

### Development Tools
- **Reactotron**: Debugging tool
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Orval**: API client generator
- **babel-plugin-root-import**: Absolute imports with `~` prefix

## 🐛 Troubleshooting

### Common Issues

1. **Pod install fails**
   ```bash
   cd ios
   pod deintegrate
   pod install --repo-update
   ```

2. **Metro bundler cache issues**
   ```bash
   pnpm start --reset-cache
   ```

3. **Android build fails**
   ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

4. **Patches not applying**
   ```bash
   # Remove node_modules and reinstall
   rm -rf node_modules
   pnpm install
   ```

5. **iOS signing issues**
   - Open `ios/trofimobile.xcworkspace` in Xcode
   - Select your development team in Signing & Capabilities

### Additional Resources

- [React Native Documentation](https://reactnative.dev/)
- [pnpm Documentation](https://pnpm.io/)
- [React Navigation](https://reactnavigation.org/)
- [Firebase Documentation](https://rnfirebase.io/)

## 📝 License

This is a sample project. Adjust the license according to your needs.

## 🤝 Contributing

This is a template project. Feel free to customize it for your specific needs.

---

**Note**: This project is intended as a starting point for React Native development. Make sure to:
- Create `.env` file with your API keys and configuration (see [Environment Variables](#environment-variables))
- Update Firebase configuration with your own `google-services.json` and `GoogleService-Info.plist`
- Configure app signing for production releases
- Review and adjust permissions in `AndroidManifest.xml` and `Info.plist`
- Update app name, bundle ID, and package name throughout the project
- Set up environment-specific `.env` files (`.env.development`, `.env.staging`, `.env.production`)
- Remove or configure New Relic if not needed (see `index.js` and build configs)

