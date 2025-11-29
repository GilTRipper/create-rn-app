# Development Guide

Complete guide for developing and testing the `create-react-native-app` CLI tool.

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

- Node.js >= 20
- npm, yarn, or pnpm
- Git
- Basic knowledge of React Native

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/GilTRipper/create-react-native-app.git
cd create-react-native-app

# Install dependencies
npm install

# Link the CLI locally
npm link
```

After linking, the `create-react-native-app` command will be available globally on your machine.

## Project Structure

```
create-react-native-app/
├── .github/
│   └── workflows/           # GitHub Actions
│       ├── publish.yml      # Auto-publish to npm
│       └── test.yml         # CI tests
├── bin/
│   └── cli.js              # Entry point (executable)
├── src/
│   ├── index.js            # Main CLI logic & commander setup
│   ├── prompts.js          # Interactive prompts (inquirer)
│   ├── template.js         # Template copying and replacement
│   └── utils.js            # Utility functions
├── template/               # React Native app template
│   ├── android/            # Android native code
│   ├── ios/                # iOS native code
│   ├── assets/             # Fonts, icons, images
│   ├── src/                # App source code (placeholder)
│   ├── App.tsx             # Root component
│   ├── package.json        # App dependencies
│   └── ...                 # Config files
├── .npmignore              # Files to exclude from npm package
├── package.json            # CLI package config
├── CHANGELOG.md            # Version history
├── DEVELOPMENT.md          # This file
├── README.md               # User documentation
└── RELEASE.md              # Release process documentation
```

### Key Files

#### `bin/cli.js`
- Entry point for the CLI
- Must have executable permissions
- Includes shebang (`#!/usr/bin/env node`)

#### `src/index.js`
- Main CLI logic
- Commander.js setup
- Command parsing and validation

#### `src/prompts.js`
- Interactive prompts using inquirer
- Project name input
- Package manager selection
- Other configuration options

#### `src/template.js`
- Template copying logic
- Placeholder replacement
- File name transformations

#### `src/utils.js`
- Utility functions
- Validation helpers
- File system operations

## Local Development

### Testing Your Changes

```bash
# After making changes, test the CLI:
create-react-native-app TestApp

# Test with different options:
create-react-native-app TestPnpm -p pnpm --skip-install
create-react-native-app TestNpm -p npm --skip-install
create-react-native-app TestYarn -p yarn --skip-git

# Test interactive mode:
create-react-native-app

# Test help:
create-react-native-app --help
create-react-native-app --version
```

### Unlinking

When done testing:

```bash
npm unlink -g create-react-native-app
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

### Manual Testing Checklist

Test the CLI with various configurations:

- [ ] `create-react-native-app TestApp` (interactive mode)
- [ ] `create-react-native-app TestNpm -p npm`
- [ ] `create-react-native-app TestYarn -p yarn`
- [ ] `create-react-native-app TestPnpm -p pnpm`
- [ ] `create-react-native-app TestSkip --skip-install`
- [ ] `create-react-native-app TestGit --skip-git`
- [ ] `create-react-native-app TestBoth --skip-install --skip-git`
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
   create-react-native-app TestTemplateUpdate
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
3. Update `src/template.js` if special handling needed
4. Test by creating a project

### Template Dependencies

The `template/package.json` contains all React Native dependencies. Update carefully:

- Test new dependencies before adding
- Keep versions compatible
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

2. **Update prompts** in `src/prompts.js` (if interactive):

```javascript
questions.push({
  type: 'input',
  name: 'newOption',
  message: 'Enter value for new option:',
  default: 'default-value'
});
```

3. **Update README.md** with documentation

4. **Test** the new option

### Adding a New Prompt

Edit `src/prompts.js`:

```javascript
// List selection
questions.push({
  type: 'list',
  name: 'feature',
  message: 'Select a feature:',
  choices: ['Feature1', 'Feature2', 'Feature3'],
  default: 'Feature1'
});

// Confirmation
questions.push({
  type: 'confirm',
  name: 'includeFeature',
  message: 'Include this feature?',
  default: true
});
```

### Adding Template Modifications

Edit `src/template.js`:

```javascript
async function createApp(projectName, options) {
  // ... existing code ...
  
  // Add custom logic
  if (options.customFeature) {
    // Modify files
    const filePath = path.join(projectDir, 'some-file.js');
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/pattern/, 'replacement');
    fs.writeFileSync(filePath, content);
  }
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
npm unlink -g create-react-native-app
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
tar -tzf create-react-native-app-1.0.0.tgz

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
3. Test published package with `npx create-react-native-app@latest`

---

**Happy coding! 🚀**
