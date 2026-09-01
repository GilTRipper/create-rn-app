# Development Guide

Complete guide for developing and testing the `create-rn-app` CLI tool.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Local Development](#local-development)
4. [Testing](#testing)
5. [Template System](#template-system)
6. [Adding Features](#adding-features)
7. [Best Practices](#best-practices)

## Getting Started

### Prerequisites

- Node.js >= 22.11.0 (CLI and generated template apps).
- npm, yarn, or pnpm
- Git
- Basic knowledge of React Native

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/GilTRipper/create-rn-app.git
cd create-rn-app

# Install dependencies
npm install

# Link the CLI locally
npm link
```

After linking, the `create-rn-app` command will be available globally on your machine.

## Project Structure

```
create-rn-app/
├── .github/
│   └── workflows/           # GitHub Actions
│       ├── publish.yml      # Auto-publish to npm
│       └── test.yml         # CI tests
├── bin/
│   └── cli.js              # Entry point (executable)
├── src/
│   ├── index.js            # Main CLI logic & commander setup
│   ├── prompts.js          # Facade: getPrompts
│   ├── get-prompts.js      # Prompt pipeline
│   ├── template.js         # Facade: createApp
│   ├── ui-templates.js     # Facade: UI kit catalog (tests)
│   ├── utils.js            # Utility functions
│   ├── shared/             # Path helpers, Xcode IDs
│   ├── core/               # Copy template, placeholders, install
│   └── features/           # Optional modules (prompt + apply)
│       ├── assets/
│       ├── environments/
│       ├── firebase/
│       ├── maps/
│       ├── storage/
│       ├── auth/
│       ├── navigation/
│       ├── localization/
│       ├── theme/
│       └── ui-kit/
├── template/               # React Native app template
│   ├── android/            # Android native code
│   ├── ios/                # iOS native code
│   ├── assets/             # Fonts, icons, images
│   ├── src/                # App source code (placeholder)
│   ├── App.tsx             # Root component
│   ├── package.json        # App dependencies
│   └── ...                 # Config files
├── template-presets/       # Optional features (nav, auth, theme, i18n, maps)
├── ui-templates/           # Optional UI components copied on demand
├── tests/
│   ├── unit/               # Fast node:test helpers
│   ├── e2e/                # Generator e2e via createApp()
│   └── helpers/            # generateProject + fs asserts
├── .cursor/                # Cursor rules + skills (not published)
├── AGENTS.md               # Pointer: read CLAUDE.md
├── CLAUDE.md               # Short agent instructions
├── .npmignore              # Files to exclude from npm package
├── package.json            # CLI package config
├── CHANGELOG.md            # Version history
├── DEVELOPMENT.md          # This file
├── README.md               # User documentation
└── RELEASE.md              # Release process documentation
```

Agent-facing docs: start at `CLAUDE.md`. This file stays the long human guide.

### Key Files

#### `bin/cli.js`
- Entry point for the CLI
- Must have executable permissions
- Includes shebang (`#!/usr/bin/env node`)

#### `src/index.js`
- Main CLI logic
- Commander.js setup
- Command parsing and validation

#### `src/prompts.js` / `src/get-prompts.js`
- Interactive prompt pipeline
- `src/prompts.js` re-exports `getPrompts`
- Feature questions live in `src/features/<name>/prompt.js`

#### `src/template.js` / `src/core/create-app.js`
- Project generation pipeline
- `src/template.js` re-exports `createApp`
- Core copy/rename/install lives in `src/core/`
- Optional features apply via `src/features/<name>/apply.js`

#### `src/utils.js`
- Utility functions
- Validation helpers
- File system operations

## Local Development

### Testing Your Changes

```bash
# After making changes, test the CLI:
create-rn-app TestApp

# Test with different options:
create-rn-app TestPnpm -p pnpm --skip-install
create-rn-app TestNpm -p npm --skip-install
create-rn-app TestYarn -p yarn --skip-git

# Test interactive mode:
create-rn-app

# Test help:
create-rn-app --help
create-rn-app --version
```

### Unlinking

When done testing:

```bash
npm unlink -g create-rn-app
```

To relink after changes:

```bash
npm link
```

### Debugging

Add debug logs in your code:

```javascript
console.log('Debug:', variable);
```

Or use Node.js debugger:

```bash
node --inspect-brk bin/cli.js TestApp
```

## Testing

```bash
npm test              # unit (tests/unit)
npm run test:e2e      # generator e2e (createApp, then cleanup)
npm run test:all      # both
```

Generator e2e does **not** use inquirer. Enable a feature by passing it to `createApp` via `tests/helpers/generate.js`. See `tests/README.md`.

### Manual Testing Checklist

Test the CLI with various configurations:

- [ ] `create-rn-app TestApp` (interactive mode)
- [ ] `create-rn-app TestNpm -p npm`
- [ ] `create-rn-app TestYarn -p yarn`
- [ ] `create-rn-app TestPnpm -p pnpm`
- [ ] `create-rn-app TestSkip --skip-install`
- [ ] `create-rn-app TestGit --skip-git`
- [ ] `create-rn-app TestBoth --skip-install --skip-git`
- [ ] Test with special characters in project name
- [ ] Test with existing directory
- [ ] Test cancellation (Ctrl+C)

### Verify Generated Project

After creating a test project:

```bash
cd TestApp

# Check structure
ls -la

# Check package.json
cat package.json

# Check that placeholders are replaced
grep -r "HelloWorld" .
grep -r "helloworld" .

# Verify dependencies install (if not skipped)
npm ls  # or yarn list, pnpm list

# Try building
npm run android  # or ios
```

### Test on Different Platforms

- macOS (iOS + Android)
- Linux (Android)
- Windows (Android)

### CI/CD Testing

GitHub Actions automatically runs tests on push/PR:

- Checks package structure
- Tests CLI commands
- Verifies help and version output

See `.github/workflows/test.yml` for details.

## Template System

### How Templates Work

The `template/` directory contains a complete React Native project with placeholders:

- `HelloWorld` → PascalCase project name
- `helloworld` → lowercase project name
- `com.helloworld` → bundle identifier
- `Hello World` → display name

### Placeholder Locations

Placeholders are replaced in these files:

#### JavaScript/TypeScript Files
- `package.json` - name field
- `app.json` - name and displayName

#### Android Files
- `android/app/build.gradle` - applicationId
- `android/settings.gradle` - rootProject.name
- `android/app/src/main/AndroidManifest.xml` - package name
- `android/app/src/main/java/com/helloworld/` - directory name and package

#### iOS Files
- `ios/Podfile` - target name
- `ios/HelloWorld/` - directory name
- `ios/HelloWorld.xcodeproj/` - project name
- Swift files - bundle identifier references

### Updating the Template

To update the template:

1. **Make changes** in `template/` directory
2. **Use placeholders** where project name should appear:
   ```
   HelloWorld → for PascalCase (class names, etc)
   helloworld → for lowercase (package names, etc)
   com.helloworld → for bundle ID
   ```
3. **Test** by creating a new project:
   ```bash
   create-rn-app TestTemplateUpdate
   ```
4. **Verify** all placeholders are replaced correctly:
   ```bash
   cd TestTemplateUpdate
   grep -r "HelloWorld" .
   grep -r "helloworld" .
   ```

### Adding New Files to Template

1. Add file to `template/` directory
2. If it contains project name, use placeholders
3. Update `src/core/` if special handling needed
4. Test by creating a project

### Template Dependencies

The `template/package.json` contains baseline React Native dependencies. Optional features (Firebase, localization, UI kit) inject extra packages during project creation.

- Test new dependencies before adding
- Keep versions compatible
- Put UI component packages in `src/features/ui-kit/`, not in the base template
- Update peer dependencies if needed

## Adding Features

### Adding a New CLI Option

1. **Update `src/index.js`**:

```javascript
program
  .option('--new-option <value>', 'Description of new option')
  .action((projectName, options) => {
    const newOption = options.newOption;
    // Handle new option
  });
```

2. **Update prompts** in `src/core/project-prompt.js` or `src/features/<name>/prompt.js` (if interactive):

```javascript
ctx.questions.push({
  type: 'input',
  name: 'newOption',
  message: 'Enter value for new option:',
  default: 'default-value'
});
```

3. **Update README.md** with documentation

4. **Test** the new option

### Adding a New Prompt

Add `src/features/<name>/prompt.js` and call it from `src/get-prompts.js`:

```javascript
async function prompt(ctx) {
  if (ctx.options.yes) {
    return;
  }
  const { includeFeature } = await inquirer.prompt([
    {
      type: "confirm",
      name: "includeFeature",
      message: "Include this feature?",
      default: true,
    },
  ]);
  ctx.config.includeFeature = includeFeature;
}
```

### Adding Template Modifications

Add `src/features/<name>/apply.js` and call it from `src/core/create-app.js`:

```javascript
async function apply(ctx) {
  if (!ctx.config.customFeature) {
    return;
  }
  const filePath = path.join(ctx.config.projectPath, "some-file.js");
  let content = await fs.readFile(filePath, "utf8");
  content = content.replace(/pattern/, "replacement");
  await fs.writeFile(filePath, content, "utf8");
}
```

## Best Practices

### Code Quality

1. **Use ESLint** - Follow existing code style
2. **No console.log in production** - Remove debug logs before commit
3. **Handle errors gracefully** - Provide helpful error messages
4. **Validate inputs** - Check project names, options, etc.

### Testing

1. **Test on multiple platforms** - macOS, Linux, Windows
2. **Test all package managers** - npm, yarn, pnpm
3. **Test edge cases**:
   - Special characters in names
   - Existing directories
   - Network failures
   - Permission issues
4. **Verify generated app runs** - Actually build and run the app

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/my-new-feature
```

### Commit Messages

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test updates

Example:
```
feat: add TypeScript support option
fix: resolve package manager detection issue
docs: update README with new examples
```

## Troubleshooting

### "command not found" after npm link

**Problem**: CLI command not available after linking

**Solutions**:
```bash
# Check npm global bin directory
npm bin -g

# Add to PATH (macOS/Linux)
export PATH="$PATH:$(npm bin -g)"

# Add to ~/.zshrc or ~/.bashrc permanently
echo 'export PATH="$PATH:$(npm bin -g)"' >> ~/.zshrc
```

### Changes not reflected

**Problem**: Code changes don't appear when running CLI

**Solutions**:
```bash
# Unlink and relink
npm unlink -g create-rn-app
npm link

# Or restart terminal
```

### Template files not copying

**Problem**: Files missing in generated project

**Solutions**:
- Check `files` field in `package.json` includes `template`
- Verify `.npmignore` doesn't exclude template files
- Test with `npm pack --dry-run` to see what will be included

### Permission denied

**Problem**: Cannot execute CLI

**Solution**:
```bash
chmod +x bin/cli.js
```

### Module not found

**Problem**: Import errors in code

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Useful Commands

```bash
# Check what files will be published
npm pack --dry-run

# Create actual tarball
npm pack

# Inspect tarball contents
tar -tzf create-rn-app-1.0.0.tgz

# Check package size
ls -lh *.tgz

# Validate package.json
npm pkg fix

# List linked packages
npm ls -g --depth=0

# Check for outdated dependencies
npm outdated

# Update dependencies
npm update
```

## Resources

- [Commander.js Documentation](https://github.com/tj/commander.js)
- [Inquirer.js Documentation](https://github.com/SBoudrias/Inquirer.js)
- [React Native CLI](https://github.com/react-native-community/cli)
- [npm Package Documentation](https://docs.npmjs.com/cli/v9/configuring-npm/package-json)
- [Node.js fs module](https://nodejs.org/api/fs.html)

## Next Steps

Once development is complete:

1. Update [CHANGELOG.md](./CHANGELOG.md)
2. Follow [RELEASE.md](./RELEASE.md) for publishing
3. Test published package with `npx @giltripper/create-rn-app@latest`

---

**Happy coding! 🚀**
