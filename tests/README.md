# E2E Tests

End-to-end tests for `@giltripper/create-rn-app` CLI tool.

## Running Tests Locally

### Prerequisites
- Node.js 20+
- npm, pnpm, or yarn installed
- For iOS tests: macOS with CocoaPods installed

### Run all tests with default package manager (npm)

```bash
npm run test:e2e
```

### Run tests with specific package manager

```bash
npm run test:e2e -- --package-manager npm
npm run test:e2e -- --package-manager pnpm
npm run test:e2e -- --package-manager yarn
```

### Run tests with iOS CocoaPods (macOS only)

```bash
npm run test:e2e -- --package-manager npm --test-pods
```

## What Tests Cover

1. **Project Creation**: Verifies CLI creates project with correct flags
2. **Project Structure**: Checks all required files and directories exist
3. **Package.json**: Validates package name and configuration
4. **App.json**: Validates display name
5. **AndroidManifest.xml**: Checks package attribute is set correctly
6. **Podfile**: Validates iOS target name
7. **iOS Structure**: Checks Xcode project files
8. **Android Structure**: Validates Kotlin package structure
9. **Dependencies**: Verifies node_modules and key dependencies
10. **Lock Files**: Checks package manager lock file exists
11. **CocoaPods** (optional): Validates pods installation on macOS

## CI/CD

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

The GitHub Actions workflow tests:
- npm on Ubuntu
- pnpm on Ubuntu
- yarn on Ubuntu
- iOS CocoaPods on macOS

## Test Project Location

Tests create a temporary project in `/tmp/test-e2e-app` which is automatically cleaned up after tests complete.

