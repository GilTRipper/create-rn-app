# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-11-30

### Added
- `-b, --bundle-id <bundleId>` flag to specify bundle identifier without prompts
- `-d, --display-name <displayName>` flag to specify app display name without prompts
- `-y, --yes` flag to automatically answer yes to all prompts (non-interactive mode)
- E2E tests with GitHub Actions workflow for automated testing
- Comprehensive test suite covering project creation, structure validation, and dependency installation
- Support for testing with npm, pnpm, yarn, and iOS CocoaPods

### Fixed
- Package manager detection now works correctly with all package managers (npm, yarn, pnpm)
- Fixed `execa` import issue in template.js
- npm install now uses `--legacy-peer-deps` flag to handle peer dependency conflicts
- Improved error handling for package manager checks
- AndroidManifest.xml now automatically includes `package` attribute with bundle identifier
- Fixed iOS CocoaPods installation validation issue by ensuring AndroidManifest.xml has required package attribute

### Changed
- CLI can now run in fully non-interactive mode with `--yes` flag
- Bundle identifier and display name can be provided via CLI flags instead of prompts

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
- Pre-configured Firebase (Analytics, Messaging, Remote Config)
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

