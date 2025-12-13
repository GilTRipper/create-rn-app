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

**Note:** If you skip Firebase during project creation, you can always add it later manually or re-run the generator.

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

- 🧭 React Navigation v7 with Stack and Drawer
- 📦 Zustand for state management, TanStack Query for server state
- 🔥 Firebase (optional: Analytics, Messaging, Remote Config)
- 🗺️ Google Maps integration
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
