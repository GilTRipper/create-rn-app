# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Firebase lib modules**: When Analytics and/or Remote Config are selected, corresponding lib modules are automatically created in `src/lib/analytics` and/or `src/lib/remote-config` with TypeScript implementations
- **Maps setup is now optional**: Interactive prompt to configure maps after Firebase setup
- Maps selection: Choose whether to install react-native-maps or skip maps setup
- Google Maps configuration: Optional Google Maps setup when react-native-maps is selected
- Google Maps API key prompt: Option to provide API key during setup or configure later
- Automatic maps configuration:
  - When maps are not selected: Removes react-native-maps dependencies and Google Maps code from all files
  - When react-native-maps is selected but Google Maps is disabled: Keeps react-native-maps, removes Google Maps code (uses Apple Maps on iOS)
  - When Google Maps is enabled: Configures Podfile, AppDelegate.swift, and AndroidManifest.xml
  - API key handling: Replaces placeholders when provided, leaves placeholders when skipped
- Podfile formatting: Ensures proper spacing before `post_install` block when Google Maps is removed
- Comprehensive maps tests: E2E tests covering all maps configuration scenarios
- **Firebase is now optional**: Interactive prompt to enable Firebase after environment selection
- Firebase module selection: Choose which Firebase packages to install (Analytics, Remote Config, Push Notifications/Messaging)
- Automatic Firebase configuration file handling:
  - Single environment: Prompt for directory containing `GoogleService-Info.plist` and `google-services.json`
  - Multiple environments: Prompt for base directory with per-environment folders:
    - iOS: `ios/GoogleServices/<env>/GoogleService-Info.plist` for each environment
    - Android: Production in `android/app/src/main/google-services.json`, other envs in `android/app/src/<env>/google-services.json`
- Firebase dependencies are only added when Firebase is enabled
- Google Services plugin and Podfile configuration are conditionally applied based on Firebase selection
- iOS scheme pre-actions automatically copy environment-specific `GoogleService-Info.plist` files for non-production environments
- Environment setup flow: interactive selection of environments (local/development/staging/production) with minimum two selection validation and Cancel option.
- Automatic Android flavor generation and envConfig mapping per selected environments; copies `src/main` assets/res into `src/<env>` (excluding Kotlin).
- iOS shared schemes per selected environment (`<AppName><Env>`) with pre-actions copying `.env.<env>` to `.env`.
- Splash screen images support: interactive prompt to specify directory with splash screen images
- Automatic detection and copying of splash screen images for both iOS and Android
- Support for structured directory format (ios/ and android/ subdirectories, like appicon.co exports)
- Support for flat directory format with naming patterns (splash.png, splash@2x.png, splash-hdpi.png, etc.)
- Automatic mapping of splash screen images to correct locations:
  - iOS: `ios/{projectName}/Images.xcassets/SplashScreen.imageset/`
  - Android: `android/app/src/main/res/drawable-*/splash.png`
- App icons support: interactive prompt to specify directory with app icons from appicon.co
- Automatic copying of app icons for both iOS and Android from appicon.co export structure
- Support for appicon.co directory structure:
  - Android: `android/mipmap-*/ic_launcher.png` and `ic_launcher_round.png` for all densities
  - iOS: `Assets.xcassets/AppIcon.appiconset/` with all PNG files and Contents.json
- Default blank white splash screens when no splash directory is provided
- CLI option `--splash-screen-dir <path>` to specify splash screen directory
- CLI option `--app-icon-dir <path>` to specify app icon directory

### Fixed
- iOS display name now forced into `Info.plist` (`CFBundleDisplayName` and `CFBundleName`) during generation
- Android `app_name` in `strings.xml` now correctly set to display name
- Android package directory structure now correctly nested for multi-part bundle IDs (e.g., `com.dev.family.gifted` creates proper nested folders)
- iOS bundle identifier forced in `.xcodeproj` to match CLI input (replaces default `org.reactjs.native.example.*`)
- Xcode workspace/project links updated to new app name to avoid leftover `helloworld` node
- Splash assets copy logic now renames inputs to the required target names (iOS SplashScreen@* and Android splash.png), handling arbitrary source filenames
- iOS scheme automatically renamed from `HelloWorld` to project name when environments are not selected
- Firebase `GoogleService-Info.plist` file placement:
  - Single environment: placed directly in `ios/{projectName}/GoogleService-Info.plist` and added as file reference to Xcode project
  - Multiple environments: placed in `ios/GoogleServices/<env>/GoogleService-Info.plist` and added as `GoogleServices` folder reference to Xcode project
- Removed default broken `GoogleService-Info.plist` reference from template (red link in Xcode)
- `GoogleService-Info.plist` is only added to Xcode project when Firebase is enabled
- Android `applicationId` in `build.gradle` `defaultConfig` now correctly updates even after other replacements
- iOS `AppDelegate.swift` `withModuleName` now correctly replaced with project name (lowercase)
- iOS Podfile now includes production target (`target '<projectName>' do end`) when multiple environments are created
- Updated react-native-maps configuration in Podfile to use recommended format: `pod 'react-native-maps/Google'` instead of `:subspecs => ['Google']`
- Maps dependencies are only added when maps are enabled
- Google Maps code is conditionally added/removed based on maps selection
- Podfile formatting now ensures proper spacing before `post_install` when Google Maps pod is removed

## [1.0.2] - 2025-11-30

### Added
- `-b, --bundle-id <bundleId>` flag to specify bundle identifier without prompts
- `-d, --display-name <displayName>` flag to specify app display name without prompts
- `-y, --yes` flag to automatically answer yes to all prompts (non-interactive mode)
- E2E tests with GitHub Actions workflow for automated testing
- Comprehensive test suite covering project creation, structure validation, and configuration
- Support for testing with npm, pnpm, yarn, and iOS CocoaPods
- Automatic cleanup of temporary test projects in CI/CD

### Fixed
- Package manager detection now works correctly with all package managers (npm, yarn, pnpm)
- Fixed `execa` import issue in template.js
- npm install now uses `--legacy-peer-deps` flag to handle peer dependency conflicts
- Improved error handling for package manager checks
- AndroidManifest.xml now automatically includes `package` attribute with bundle identifier
- Fixed iOS CocoaPods installation validation issue by ensuring AndroidManifest.xml has required package attribute
- Fixed E2E tests failing with pnpm due to patch application issues
- Fixed app.json displayName replacement in template

### Changed
- **Firebase is no longer included by default** - users must opt-in during project creation
- Firebase dependencies, Podfile entries, and build.gradle plugins are only added when Firebase is explicitly enabled
- Template no longer includes Firebase code in `App.tsx` by default
- CLI can now run in fully non-interactive mode with `--yes` flag
- Bundle identifier and display name can be provided via CLI flags instead of prompts
- E2E tests now use `--skip-install` to avoid dependency installation issues and focus on project structure validation
- Improved test reliability by skipping dependency installation in automated tests

## [1.0.1] - 2025-11-29

### Fixed
- Package manager selection prompt now shows correctly when `-p` flag is not provided
- Dependency installation output is now visible (removed blocking spinner)
- iOS pods installation output is now visible

### Changed
- Package name changed to scoped package `@giltripper/create-rn-app` for better namespace management
- Improved CLI branding from "Create TR React Native App" to "Create React Native App"

### Added
- `--version` and `-v` flags to display CLI version

## [1.0.0] - 2025-11-27

### Added
- Initial release of @giltripper/create-rn-app CLI
- React Native 0.82 template with TypeScript
- Firebase support (Analytics, Messaging, Remote Config) - now optional as of Unreleased
- Google Maps integration
- React Navigation (Stack + Drawer)
- Zustand state management
- TanStack Query for API calls
- MMKV storage
- Notifee push notifications
- Custom fonts and icons
- Interactive CLI prompts
- Support for npm, yarn, and pnpm
- Automatic dependency installation
- iOS CocoaPods installation
- Git initialization
- Comprehensive setup documentation

