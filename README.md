# create-rn-app

<p align="center">
  <h3 align="center">⚡ Create React Native App</h3>
  <p align="center">The fastest way to create a production-ready React Native app</p>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/create-rn-app?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/create-rn-app?style=flat-square" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/GilTRipper/create-rn-app?style=flat-square" alt="license" />
</p>

---

🚀 CLI tool to create a new React Native app with pre-configured setup including Firebase, Google Maps, Navigation, and more.

**Stop wasting time on boilerplate.** Get a production-ready React Native app in seconds with all the tools you need already configured.

## Quick Start

### Create a new project

```bash
npx @giltripper/create-rn-app MyAwesomeApp
```

### Interactive mode

```bash
npx @giltripper/create-rn-app
```

### With options

```bash
npx @giltripper/create-rn-app MyApp --package-manager pnpm --skip-install
```

## Options

- `[project-name]` - Name of your project (optional, will prompt if not provided)
- `--skip-install` - Skip dependency installation
- `--skip-git` - Skip git initialization
- `-p, --package-manager <manager>` - Package manager to use: npm, yarn, or pnpm (default: pnpm)

## What's Included

### 🧭 Navigation
- React Navigation v7 with Stack and Drawer
- Pre-configured navigation structure

### 📦 State Management
- Zustand for global state
- TanStack Query for server state
- MMKV for persistent storage

### 🔥 Firebase Integration
- Analytics
- Cloud Messaging (Push Notifications)
- Remote Config
- Pre-configured setup files

### 🗺️ Google Maps
- React Native Maps
- Ready-to-use map components
- API key configuration

### 🎨 UI Components
- Bottom Sheet (@gorhom/bottom-sheet)
- Toast Messages
- Blur View
- Fast Image
- Custom fonts (Golos Text, Tajawal, Urbanist)

### 📱 Native Features
- Push Notifications (Notifee)
- Geolocation
- Network Info
- Device Info
- Haptic Feedback
- Permissions
- Image Picker
- Date Picker

### 🛠️ Development Tools
- TypeScript
- ESLint with custom rules
- Prettier
- Custom scripts for icons and modules
- Reactotron for debugging

### ⚡ Performance
- Hermes Engine
- React Native Reanimated
- Optimized images (AVIF, WebP, SVG support)
- Splash Screen (react-native-bootsplash)

## After Creation

### 1. Setup Firebase

Add Firebase configuration files:
- **Android**: Place `google-services.json` in `android/app/`
- **iOS**: Place `GoogleService-Info.plist` in `ios/`

### 2. Setup Google Maps

Add Google Maps API keys:
- **Android**: Add `GOOGLE_MAPS_API_KEY=your_key` to `android/local.properties`
- **iOS**: Add your API key to `ios/YourApp/Info.plist`

### 3. Install dependencies (if skipped)

```bash
cd MyAwesomeApp

# With npm
npm install

# With yarn
yarn install

# With pnpm
pnpm install
```

### 4. Install iOS pods

```bash
cd ios
pod install
cd ..
```

### 5. Run the app

```bash
# iOS
npm run ios
# or
yarn ios
# or
pnpm ios

# Android
npm run android
# or
yarn android
# or
pnpm android
```

## Requirements

- **Node.js** >= 20
- **React Native development environment** setup
  - For iOS: Xcode, CocoaPods
  - For Android: Android Studio, JDK

See [React Native Environment Setup](https://reactnative.dev/docs/environment-setup) for detailed instructions.

## Project Structure

```
MyAwesomeApp/
├── android/              # Android native code
├── ios/                  # iOS native code
├── src/                  # Your React Native code
│   ├── components/       # Reusable components
│   ├── screens/          # Screen components
│   ├── navigation/       # Navigation setup
│   ├── services/         # API and services
│   └── utils/            # Utility functions
├── assets/               # Images, fonts, icons
├── App.tsx               # Root component
├── package.json
└── tsconfig.json
```

## Available Scripts

After creating your project, you can run:

```bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run tests
npm test

# Lint code
npm run lint

# Generate icons
npm run generate:icons

# Create new module
npm run generate:module
```

## Customization

### Fonts
The template includes custom fonts. You can add more in `assets/fonts/` and link them using:
```bash
npx react-native-asset
```

### Icons
Place your icons in `assets/icons/` and run:
```bash
npm run generate:icons
```

### Colors & Theme
Customize your theme in `src/theme/` or your preferred location.

## Troubleshooting

### iOS build fails
```bash
cd ios
pod deintegrate
pod install
cd ..
```

### Metro bundler issues
```bash
npm start -- --reset-cache
```

### Android build fails
```bash
cd android
./gradlew clean
cd ..
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

For major changes, please open an issue first to discuss what you would like to change.

## Documentation

- 📚 [Development Guide](./DEVELOPMENT.md) - For contributors and local development
- 🚀 [Release Guide](./RELEASE.md) - For maintainers publishing to npm
- 📝 [Changelog](./CHANGELOG.md) - Version history

## License

MIT © Gil T Ripper

## Support

If you encounter any issues, please file them in the [issues section](https://github.com/GilTRipper/create-rn-app/issues) of the repository.

---

**Made with ❤️ for the React Native community**
