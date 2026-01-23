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

🚀 CLI tool to create a new React Native app with pre-configured setup. Firebase is now optional (enable it during prompts when you need it).

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

### Non-interactive mode (CI/CD)

```bash
npx @giltripper/create-rn-app MyApp \
  --package-manager pnpm \
  --bundle-id com.company.myapp \
  --display-name "My App" \
  --skip-git \
  --yes
```

## Options

### Basic Options

- `[project-name]` - Name of your project (optional, will prompt if not provided)
- `-v, --version` - Display version number
- `-y, --yes` - Answer yes to all prompts (non-interactive mode)

### Package Manager

- `-p, --package-manager <manager>` - Package manager to use: `npm`, `yarn`, or `pnpm` (will prompt if not specified)

### Project Configuration

- `-b, --bundle-id <bundleId>` - Bundle identifier (e.g., `com.company.app`). If not provided, will prompt or use default based on project name.
- `-d, --display-name <displayName>` - App display name. If not provided, will prompt or use project name.
- `--splash-screen-dir <path>` - Path to directory with splash screen images (optional)
- `--app-icon-dir <path>` - Path to directory with app icons from appicon.co (optional)

### Environment setup

After dependency prompt, you can opt into environment configuration:

- Choose any of: `local`, `development`, `staging`, `production` (select at least two or pick Cancel to skip).
- `.env.<env>` files are expected; pre-actions copy the chosen one to `.env` for iOS schemes.
- Android: flavors are generated for the selected envs with matching `project.ext.envConfigFiles` and per-env `src/<env>` folders (assets/res copied from `main`, Kotlin stays in `main/java`).
- iOS: shared schemes named `<AppName><Env>` with pre-actions copying the corresponding `.env.<env>` file.
- iOS Podfile: When multiple environments are created, a production target (`target '<projectName>' do end`) is automatically added to the Podfile.
- **Note**: If you skip environment setup, the default iOS scheme will be automatically renamed from `HelloWorld` to your project name.

### Firebase Setup (Optional)

After environment selection, you'll be prompted to enable Firebase:

1. **Enable Firebase?** - Choose whether to install Firebase
2. **Select Firebase modules** - Choose which packages you need:
   - Analytics
   - Remote Config
   - Push Notifications (Messaging)

3. **Provide Google Services files**:
   - **Single environment**: Provide a directory containing both `GoogleService-Info.plist` and `google-services.json`
   - **Multiple environments**: Provide a base directory with per-environment folders:
     ```
     firebase-configs/
       ├── production/
       │   └── GoogleService-Info.plist
       ├── staging/
       │   └── GoogleService-Info.plist
       ├── development/
       │   └── GoogleService-Info.plist
       ├── production/        (production for both iOS and Android)
       │   └── google-services.json
       ├── staging/           (for Android staging)
       │   └── google-services.json
       └── development/       (for Android development)
           └── google-services.json
     ```

The tool will automatically:
- Copy iOS `GoogleService-Info.plist` files:
  - **Single environment**: `ios/{projectName}/GoogleService-Info.plist` (directly in project folder)
  - **Multiple environments**: `ios/GoogleServices/<env>/GoogleService-Info.plist` for each environment
- Copy Android `google-services.json` files:
  - Production: `android/app/google-services.json` (root of app folder)
  - Other environments: `android/app/src/<env>/google-services.json`
- Configure Podfile with required Firebase pods
- Update `AppDelegate.swift` with Firebase initialization
- Add Google Services plugin to Android build files
- Add selected Firebase dependencies to `package.json`
- Add `GoogleService-Info.plist` to Xcode project (as file reference for single env, or as GoogleServices folder for multiple envs)
- **Create Firebase lib modules** in `src/lib/`:
  - **Analytics**: Creates `src/lib/analytics/` with TypeScript implementation including hooks, interfaces, and types
  - **Remote Config**: Creates `src/lib/remote-config/` with TypeScript implementation including hooks, interfaces, and types
  - Both modules are fully typed and ready to use in your React Native app

**Note:** If you skip Firebase during project creation, you can always add it later manually or re-run the generator.

### Maps Setup (Optional)

After Firebase setup, you'll be prompted to configure maps:

1. **Will you be using maps?** - Choose from:
   - `react-native-maps` - Install react-native-maps library (Google Maps / Apple Maps)
   - `Mapbox` - Install @rnmapbox/maps library
   - `Cancel` - Skip maps setup

#### react-native-maps

2. **If you selected react-native-maps**, you'll be asked:
   - **Do you want to configure Google Maps?** - Choose whether to enable Google Maps support
   
3. **If you selected Google Maps**, you'll be prompted:
   - **Enter your Google Maps API key** - Provide your API key or press Enter to skip and configure later

The tool will automatically:
- **When maps are not selected:**
  - Remove `react-native-maps`, `react-native-maps-directions`, and `@rnmapbox/maps` from `package.json`
  - Remove Google Maps code from `ios/Podfile`
  - Remove Google Maps imports and initialization from `ios/{projectName}/AppDelegate.swift`
  - Comment out Google Maps API key in `android/app/src/main/AndroidManifest.xml`

- **When react-native-maps is selected but Google Maps is disabled:**
  - Keep `react-native-maps` in `package.json`
  - Create `src/map/` with `MapView` component template
  - Remove Google Maps pod from `ios/Podfile` (uses Apple Maps on iOS)
  - Remove Google Maps code from `AppDelegate.swift`
  - Comment out Google Maps API key in `AndroidManifest.xml`

- **When Google Maps is enabled:**
  - Create `src/map/` with `MapView` component template (using `PROVIDER_GOOGLE`)
  - Add Google Maps pod to `ios/Podfile`
  - Add Google Maps import and initialization to `AppDelegate.swift`
  - If API key is provided: Replace placeholders with your API key in both iOS and Android
  - If API key is skipped: Leave placeholder `<GOOGLE_MAPS_API_KEY>` in `AppDelegate.swift` and comment out `AndroidManifest.xml` entry

**Note:** On Android, Google Maps is required for react-native-maps. If you skip the API key, you'll need to configure it later in `android/local.properties` and uncomment the entry in `AndroidManifest.xml`.

#### Mapbox

2. **If you selected Mapbox**, you'll be prompted:
   - **Enter your Mapbox access token** - Provide your token or press Enter to skip and configure later

The tool will automatically:
- Add `@rnmapbox/maps` to `package.json`
- Create `src/map/` with Mapbox `MapView` component template
- Configure iOS:
  - Add `require_relative` for Mapbox autolinking to `Podfile`
  - Add `$RNMapboxMaps.pre_install` and `$RNMapboxMaps.post_install` hooks
- Configure Android:
  - Add Mapbox Maven repository to `android/build.gradle`
- Update `App.tsx`:
  - Add `import Mapbox from "@rnmapbox/maps"`
  - Add `Mapbox.setAccessToken("<your-token>")` (or placeholder if skipped)

**Note:** You can get a Mapbox access token from [Mapbox Account](https://account.mapbox.com/access-tokens/).

**Note:** If you skip maps during project creation, you can always add them later manually or re-run the generator.

### Navigation & Auth Setup (Optional)

After maps setup, you'll be prompted to configure navigation:

1. **Do you want to set up base navigation?** - Choose whether to set up navigation structure
2. **If you selected navigation**, you'll be asked to choose a variant:
   - **Without auth (only AppNavigator, no auth folder)** - Simple navigation setup with just `AppNavigator` for apps that don't need authentication
   - **With auth (RootNavigator + AuthNavigator + auth store)** - Full navigation setup with authentication flow including:
     - `RootNavigator` - Root navigator that switches between auth and app screens based on authorization state
     - `AuthNavigator` - Authentication flow navigator (Login, Register screens)
     - `AppNavigator` - Main app navigator for authenticated users
     - Auth store - Zustand-based authentication state management

The tool will automatically:
- **When navigation is not selected:**
  - No navigation files are created (you can add navigation manually later)

- **When "Without auth" is selected:**
  - Creates `src/ui/navigation/` with:
    - `AppNavigator.tsx` - Main app navigator
    - `types.ts` - Navigation types (only AppRoutes, no RootRoutes or AuthRoutes)
    - `index.ts` - Exports AppNavigator
  - No auth folder is created

- **When "With auth" is selected:**
  - Creates `src/auth/` with:
    - `store/index.ts` - Zustand auth store with persistence
    - `types.ts` - Auth state types
    - `index.ts` - Auth exports
  - Creates `src/ui/navigation/` with:
    - `RootNavigator.tsx` - Root navigator that switches based on auth state
    - `AuthNavigator.tsx` - Auth flow navigator (Login, Register)
    - `AppNavigator.tsx` - Main app navigator
    - `types.ts` - Complete navigation types (RootRoutes, AuthRoutes, AppRoutes)
    - `index.ts` - Exports RootNavigator
  - Automatically creates `src/lib/storage.ts` (Zustand storage) if not already present (required for auth store persistence)

**Note:** If you select "With auth" navigation, Zustand storage will be automatically set up even if you didn't select it separately, as it's required for the auth store.

**Note:** If you skip navigation during project creation, you can always add it later manually or re-run the generator.

### Localization Setup (Optional)

After navigation setup, you'll be prompted to configure localization (based on `lepimvarim`):

1. **Do you want to set up localization?** - Uses:
   - `i18next`
   - `react-i18next`
   - `i18next-icu`
   - `react-native-localize`
2. **Default language** - Choose a default language code (e.g. `ru`, `en`, `ar`, `pt-BR`)
   - This code is also used to create the first JSON file in `src/lib/localization/languages/<lang>.json`
3. **Use with Remote Config?** - Optional integration with Firebase Remote Config
   - If enabled, localization will fetch translations from Remote Config
   - Local translations are merged with remote translations (local takes precedence for default language)
   - **Note:** Requires Firebase Remote Config to be enabled (you'll be warned if it's not)

The tool will automatically:
- Add i18n dependencies to `package.json` when localization is enabled
- Create `src/lib/localization/` with provider/store/types and `languages/<lang>.json`
- Ensure `src/lib/storage.ts` exists (required for persisted language selection)
- Update `App.tsx` to wrap the app in `LocalizationProvider` and initialize localization on startup
- **If "Use with Remote Config" is enabled:**
  - Integrates with Firebase Remote Config to fetch translations remotely
  - Local translations are merged with remote translations (deep merge)
  - All languages from Remote Config are automatically added to i18n resources
  - Requires Firebase Remote Config module to be enabled (warns if not enabled)

**Note:** If you skip localization during project creation, you can always add it later manually or re-run the generator.

### Splash Screen

During project creation, you'll be prompted to provide a path to a directory containing splash screen images. This is optional - you can press Enter to skip and use default blank white splash screens.

**💡 Recommended:** For best results, use [appicon.co Image Sets](https://www.appicon.co/#image-sets) to generate splash screen images. The tool works best with structured directory format exported by appicon.co.

**Supported directory structures:**

1. **Structured format** (recommended - like [appicon.co](https://www.appicon.co/#image-sets)):
   ```
   splash-images/
     ├── ios/
     │   ├── IMG_3832.png
     │   ├── IMG_3832@2x.png
     │   └── IMG_3832@3x.png
     └── android/
         ├── drawable-hdpi/
         │   └── IMG_3832.jpeg
         ├── drawable-mdpi/
         │   └── IMG_3832.jpeg
         └── ...
   ```
   
   **Note:** Files are copied with their original names. You can use any filenames you want - the tool will preserve them.

2. **Flat format** (files with naming patterns):
   ```
   splash-images/
     ├── splash.png
     ├── splash@2x.png
     ├── splash@3x.png
     ├── splash-hdpi.png
     ├── splash-mdpi.png
     └── ...
   ```

The tool will automatically detect the structure and copy images to the correct locations for both iOS and Android, preserving original filenames.

**CLI option:** `--splash-screen-dir <path>` - Specify splash screen directory path directly

### App Icons

During project creation, you'll be prompted to provide a path to a directory containing app icons. This is optional - you can press Enter to skip and use default icons.

**💡 Recommended:** Use [appicon.co](https://www.appicon.co/#app-icon) to generate app icons. The tool is optimized to work with the directory structure exported by appicon.co.

**Expected directory structure** (from appicon.co export):
```
AppIcons/
  ├── android/
  │   ├── mipmap-hdpi/
  │   │   ├── ic_launcher.png
  │   │   └── ic_launcher_round.png
  │   ├── mipmap-mdpi/
  │   │   ├── ic_launcher.png
  │   │   └── ic_launcher_round.png
  │   └── ... (other densities)
  └── Assets.xcassets/
      └── AppIcon.appiconset/
          ├── 1024.png
          ├── 180.png
          ├── ... (all iOS icon sizes)
          └── Contents.json
```

The tool will automatically copy all icons to the correct locations:
- **Android**: Icons are copied to `android/app/src/main/res/mipmap-*/` for all density folders
- **iOS**: All PNG files and `Contents.json` are copied to `ios/{projectName}/Images.xcassets/AppIcon.appiconset/`

**CLI option:** `--app-icon-dir <path>` - Specify app icon directory path directly

### Installation Options

- `--skip-install` - Skip dependency installation
- `--skip-pods` - Skip iOS CocoaPods installation
- `--skip-git` - Skip git initialization

## Examples

### Quick start with prompts

```bash
npx @giltripper/create-rn-app MyApp
```

### Full non-interactive setup

```bash
npx @giltripper/create-rn-app MyApp \
  -p pnpm \
  -b com.mycompany.myapp \
  -d "My Awesome App" \
  --skip-git \
  --yes
```

### Create project without installing dependencies

```bash
npx @giltripper/create-rn-app MyApp --skip-install
```

### Create project with specific package manager

```bash
npx @giltripper/create-rn-app MyApp -p yarn
```

### Create project with splash screen images

When prompted, provide the path to your splash screen images directory:

```bash
npx @giltripper/create-rn-app MyApp
# When prompted: "Path to directory with splash screen images"
# Enter: ./splash-images
```

Or use the CLI option:

```bash
npx @giltripper/create-rn-app MyApp --splash-screen-dir ./splash-images
```

The tool will automatically copy and configure splash screen images for both iOS and Android.

### Create project with app icons

When prompted, provide the path to your app icons directory (from appicon.co):

```bash
npx @giltripper/create-rn-app MyApp
# When prompted: "Path to directory with app icons from appicon.co"
# Enter: ./AppIcons
```

Or use the CLI option:

```bash
npx @giltripper/create-rn-app MyApp --app-icon-dir ./AppIcons
```

The tool will automatically copy and configure app icons for both iOS and Android.

## What's Included

The generated project includes a production-ready React Native app with:

- 🧭 React Navigation v7 with Stack and Drawer (optional: with or without auth flow)
- 🔐 Authentication setup (optional: Zustand-based auth store with navigation flow)
- 🌍 Localization setup (optional: i18next + react-i18next + i18next-icu + react-native-localize)
- 📦 Zustand for state management, TanStack Query for server state
- 🔥 Firebase (optional: Analytics, Messaging, Remote Config)
- 🗺️ Maps integration (optional: react-native-maps with Google Maps or Mapbox)
- 🎨 Modern UI components (Bottom Sheet, Toast, Blur View, etc.)
- 📱 Native features (Push Notifications, Geolocation, Permissions, etc.)
- 🛠️ TypeScript, ESLint, Prettier, and development tools
- ⚡ Performance optimizations (Hermes, Reanimated, optimized images)

**For detailed information about the generated project, see the [Template README](./template/README.md)**

## Requirements

- **Node.js** >= 20
- **React Native development environment** setup
  - For iOS: Xcode, CocoaPods
  - For Android: Android Studio, JDK

See [React Native Environment Setup](https://reactnative.dev/docs/environment-setup) for detailed instructions.

## Non-Interactive Mode

The CLI supports fully non-interactive mode using the `--yes` flag, making it perfect for CI/CD pipelines and automation:

```bash
npx @giltripper/create-rn-app MyApp \
  --package-manager pnpm \
  --bundle-id com.company.myapp \
  --display-name "My App" \
  --skip-git \
  --yes
```

When using `--yes`, all prompts are automatically answered with default values, and you can provide all configuration via CLI flags.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

For major changes, please open an issue first to discuss what you would like to change.

## Documentation

### For Users
- 📱 [Template README](./template/README.md) - Complete guide for the generated React Native project
- 📝 [Changelog](./CHANGELOG.md) - Version history and changes

### For Contributors
- 📚 [Development Guide](./DEVELOPMENT.md) - For contributors and local development
- 🧪 [Tests README](./tests/README.md) - E2E testing guide
- 🚀 [Release Guide](./RELEASE.md) - For maintainers publishing to npm

## License

MIT © Gil T Ripper

## Support

If you encounter any issues, please file them in the [issues section](https://github.com/GilTRipper/create-rn-app/issues) of the repository.

---

**Made with ❤️ for the React Native community**
