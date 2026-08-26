# Release Guide

Complete guide for publishing `create-rn-app` to npm via automated GitHub Actions.

## Table of Contents

1. [Quick Start](#quick-start)
2. [One-Time Setup](#one-time-setup)
3. [Release Process](#release-process)
4. [Pre-Release Checklist](#pre-release-checklist)
5. [Troubleshooting](#troubleshooting)
6. [Manual Publishing](#manual-publishing)

---

## Quick Start

**TL;DR** - If you're already set up:

```bash
npm version patch && git push --follow-tags
```

That's it! GitHub Actions will automatically:
1. Create GitHub Release with CHANGELOG.md content ✨
2. Publish to npm ✨

---

## One-Time Setup

Complete these steps once to enable automated releases.

### Step 1: Create npm Token

1. Log in to [npmjs.com](https://www.npmjs.com/)
2. Go to **Settings** → **Access Tokens** → **Generate New Token**
3. Select **Classic Token**
4. Configure:
   - **Type**: `Automation` (for CI/CD)
   - **Expiration**: `No expiration` (recommended) or set a date
   - **Description**: `GitHub Actions - create-rn-app`
5. Click **Generate Token**
6. **Copy the token** (shown only once!)

```
npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **Important**: Save this token securely! You'll need it in the next step.

#### Token Types Explained

**Classic Token - Automation** (Recommended):
- ✅ Simple setup
- ✅ Works for all packages
- ✅ Can be set to never expire
- ✅ Designed for CI/CD systems

**Granular Access Token**:
- 🔐 More secure (package-specific permissions)
- ⏱️ Maximum 1 year expiration (npm limitation)
- 🎯 Requires package to exist first

For this project, use **Classic Token** with **Automation** type.

### Step 2: Add Token to GitHub Secrets

#### Via GitHub Web Interface:

1. Open your repository: `https://github.com/GilTRipper/create-rn-app`
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Fill in:
   ```
   Name: NPM_TOKEN
   Secret: npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Click **"Add secret"**

#### Via GitHub CLI:

```bash
# Install GitHub CLI if needed
brew install gh  # macOS
# or download from https://cli.github.com/

# Authenticate
gh auth login

# Add secret
gh secret set NPM_TOKEN
# Paste your token and press Enter
```

### Step 3: Verify Setup

Check that everything is configured:

- [ ] NPM_TOKEN exists in GitHub Secrets
- [ ] `.github/workflows/publish.yml` exists
- [ ] `.github/workflows/test.yml` exists
- [ ] `package.json` has correct `repository` URL
- [ ] `package.json` has correct `author` information

---

## Release Process

Follow these steps for each release.

### Standard Release (Recommended)

```bash
# 1. Update CHANGELOG.md with release notes for the new version
# Edit CHANGELOG.md and add entry for the new version

# 2. Update version (this creates a commit and tag)
npm version patch  # or minor, or major

# 3. Push with tags
git push origin main --follow-tags

# 4. Wait for GitHub Actions to:
#    - Automatically create GitHub Release with CHANGELOG.md content ✨
#    - Automatically publish to npm ✨
```

**Note**: The release workflow automatically extracts the changelog entry for the version from `CHANGELOG.md` and uses it as release notes.

### Detailed Step-by-Step

#### 1. Update Version

Choose the appropriate version bump based on your changes:

```bash
# Patch: Bug fixes (1.0.0 → 1.0.1)
npm version patch

# Minor: New features, backward compatible (1.0.0 → 1.1.0)
npm version minor

# Major: Breaking changes (1.0.0 → 2.0.0)
npm version major
```

This command will:
- Update version in `package.json`
- Create a git commit
- Create a git tag

#### 2. Update CHANGELOG (Required)

**Important**: Update `CHANGELOG.md` BEFORE running `npm version`, as the release workflow automatically extracts the changelog entry for the version.

Add release notes to `CHANGELOG.md`:

```markdown
## [1.0.1] - 2024-11-29

### Added
- New feature X

### Fixed
- Bug Y

### Changed
- Improvement Z
```

The release workflow will automatically use this entry as the GitHub Release notes.

#### 3. Push Changes

```bash
git push origin main --follow-tags
```

The `--follow-tags` flag pushes both the commit and the version tag.

#### 4. GitHub Release (Automatic)

**The release is created automatically** when you push the tag! 🎉

The `.github/workflows/release.yml` workflow:
- Triggers on tag push (e.g., `v1.0.1`)
- Extracts the changelog entry from `CHANGELOG.md` for that version
- Creates a GitHub Release with the changelog content as release notes
- No manual steps required!

**Manual Override** (if needed):

If you need to create a release manually:

```bash
# Using GitHub CLI
gh release create v1.0.1 --generate-notes

# Or with custom notes
gh release create v1.0.1 \
  --title "v1.0.1" \
  --notes "Bug fixes and improvements"
```

#### 5. Monitor GitHub Actions

1. Go to **Actions** tab in your repository
2. You should see two workflows:
   - **"Create Release"** - Creates GitHub Release with CHANGELOG.md
   - **"Publish to npm"** - Publishes to npm (triggers when release is published or tag is pushed)
3. Wait for completion (usually 2-3 minutes total)
4. Green checkmarks ✅ = Success!

**If publish workflow didn't run automatically:**

You can trigger it manually:
1. Go to **Actions** → **"Publish to npm"**
2. Click **"Run workflow"**
3. Enter the tag name (e.g., `v1.0.2`)
4. Click **"Run workflow"**

#### 6. Verify Publication

```bash
# Check package on npm
npm view @giltripper/create-rn-app

# Check latest version
npm view @giltripper/create-rn-app version

# Test installation
npx @giltripper/create-rn-app@latest TestPublished

# Or install globally
npm install -g @giltripper/create-rn-app
create-rn-app --version
```

---

## Pre-Release Checklist

Use this checklist before each release to ensure quality.

### ✅ Code Quality

- [ ] All tests pass locally
- [ ] No `console.log` or `debugger` statements
- [ ] Code is formatted (ESLint/Prettier)
- [ ] No critical issues on GitHub

### ✅ Package Configuration

- [ ] Version updated in `package.json`
- [ ] `name` is correct
- [ ] `description` is up-to-date
- [ ] `keywords` are relevant
- [ ] `repository` URL is correct
- [ ] `author` is filled in
- [ ] `license` is specified
- [ ] `bin` points to correct file
- [ ] `files` includes necessary directories

### ✅ Documentation

- [ ] README.md is up-to-date
- [ ] CHANGELOG.md has entry for this version
- [ ] Examples in docs work
- [ ] Links in docs are valid

### ✅ Local Testing

Test thoroughly before releasing:

```bash
# Link locally
npm link

# Test basic usage
create-rn-app TestApp1

# Test with options
create-rn-app TestApp2 --skip-install
create-rn-app TestApp3 -p npm --skip-git

# Test interactive mode
create-rn-app

# Verify help
create-rn-app --help
create-rn-app --version

# Check generated project
cd TestApp1
ls -la
grep -r "HelloWorld" .  # Should find nothing

# Unlink after testing
npm unlink -g create-rn-app
```

### ✅ Package Contents

```bash
# Preview what will be published
npm pack --dry-run

# Check package size
npm pack
ls -lh *.tgz

# Inspect contents
tar -tzf create-rn-app-*.tgz
```

Verify:
- [ ] Template directory is included
- [ ] Source files are included
- [ ] Documentation files (except README) are excluded
- [ ] Test files are excluded
- [ ] `.github` directory is excluded

### ✅ GitHub Configuration

- [ ] NPM_TOKEN is set in GitHub Secrets
- [ ] Token is valid and has Automation permissions
- [ ] Workflows exist and are valid:
  - [ ] `.github/workflows/publish.yml`
  - [ ] `.github/workflows/test.yml`

---

## Semantic Versioning

Follow [semver](https://semver.org/) for version numbers: **MAJOR.MINOR.PATCH**

| Version Type | Command | Example | When to Use |
|-------------|---------|---------|-------------|
| **Patch** | `npm version patch` | 1.0.0 → 1.0.1 | Bug fixes, typos, small improvements |
| **Minor** | `npm version minor` | 1.0.0 → 1.1.0 | New features, backward compatible |
| **Major** | `npm version major` | 1.0.0 → 2.0.0 | Breaking changes, major refactor |

### Examples

**Patch (1.0.0 → 1.0.1)**:
- Fix template placeholder bug
- Update documentation
- Fix CLI option parsing

**Minor (1.0.0 → 1.1.0)**:
- Add new CLI option
- Add new template features
- Add new dependencies to template

**Major (1.0.0 → 2.0.0)**:
- Remove/rename CLI options
- Change template structure significantly
- Upgrade React Native major version

---

## Troubleshooting

### Workflow Not Starting

**Problem**: GitHub Actions workflow doesn't run after creating release

**Solutions**:
- Ensure release is **Published** (not Draft)
- Check `.github/workflows/publish.yml` exists
- Verify workflow syntax is correct
- Check Actions tab for error messages

### Publish Fails: 403 Forbidden

**Error**:
```
npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/create-rn-app
```

**Solutions**:
- Verify NPM_TOKEN in GitHub Secrets
- Check token hasn't expired (on npmjs.com)
- Ensure token type is **Automation**
- Regenerate token if needed

### Publish Fails: Version Already Exists

**Error**:
```
npm ERR! 403 You cannot publish over the previously published versions
```

**Solution**:
```bash
# Update version again
npm version patch
git push --follow-tags

# Create new release
gh release create $(git describe --tags --abbrev=0) --generate-notes
```

### GitHub CLI Not Found

**Error**: `command not found: gh`

**Solution**:
```bash
# macOS
brew install gh

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Windows
# Download from https://cli.github.com/

# After install, authenticate
gh auth login
```

### Token Permission Error

**Error**: Token doesn't have permission to publish

**Solution**:
1. Go to https://www.npmjs.com/settings/tokens
2. Delete old token
3. Create new **Classic Token** with **Automation** type
4. Update NPM_TOKEN in GitHub Secrets

---

## Workflow Details

### Automated Release Workflow

File: `.github/workflows/release.yml`

**Triggers**: When a tag is pushed (e.g., `v1.0.1`)

**Steps**:
1. Checkout code
2. Extract version from tag
3. Extract changelog entry from `CHANGELOG.md` for that version
4. Create GitHub Release with changelog content as release notes

**Result**: GitHub Release is automatically created with content from `CHANGELOG.md`

### Automated Publishing Workflow

File: `.github/workflows/publish.yml`

**Triggers**: When a GitHub Release is published

**Steps**:
1. Checkout code
2. Setup Node.js 22
3. Install dependencies (`npm install`)
4. Publish to npm (`npm publish`)

**Environment Variables**:
- `NODE_AUTH_TOKEN`: Uses `secrets.NPM_TOKEN`

**Note**: This workflow runs automatically after the release workflow creates a GitHub Release.

### CI Testing Workflow

File: `.github/workflows/test.yml`

**Triggers**: On push to `main` and pull requests

**Steps**:
1. Checkout code
2. Setup Node.js 22
3. Install dependencies
4. Run structure checks
5. Test CLI commands

---

## Manual Publishing

If automated publishing fails or you need to publish manually:

### Prerequisites

```bash
# Login to npm
npm login

# Verify you're logged in
npm whoami
```

### Publish

```bash
# From project root
npm publish
```

### Test Published Version

```bash
# View package info
npm view @giltripper/create-rn-app

# Test with npx
npx @giltripper/create-rn-app@latest TestManualPublish
```

---

## Useful Commands

```bash
# Version management
npm version                                      # Show current version
git describe --tags --abbrev=0                  # Show latest tag
npm view @giltripper/create-rn-app version        # Check npm version
npm view @giltripper/create-rn-app versions       # List all versions

# Package inspection
npm pack --dry-run                              # Preview package contents
npm pack                                         # Create tarball
tar -tzf create-rn-app-*.tgz          # List tarball contents
ls -lh *.tgz                                     # Check package size

# Git operations
git log --oneline $(git describe --tags --abbrev=0)..HEAD  # Changes since last tag
git tag                                          # List all tags
git tag -d v1.0.0                               # Delete local tag
git push origin :refs/tags/v1.0.0               # Delete remote tag

# npm operations
npm view @giltripper/create-rn-app                 # View package info
npm dist-tag ls create-rn-app         # List dist tags
npm unpublish create-rn-app@1.0.0     # Unpublish (within 72h)
```

---

## Post-Release

After successful release:

- [ ] Verify package on [npmjs.com](https://www.npmjs.com/package/create-rn-app)
- [ ] Test with `npx @giltripper/create-rn-app@latest`
- [ ] Update project documentation if needed
- [ ] Announce release (optional):
  - Twitter/X
  - Reddit (r/reactnative)
  - Discord communities
  - GitHub Discussions

---

## Resources

- 📦 [npm Package](https://www.npmjs.com/package/create-rn-app)
- 🐙 [GitHub Repository](https://github.com/GilTRipper/create-rn-app)
- 📖 [npm Publishing Docs](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- 🔄 [GitHub Actions Docs](https://docs.github.com/en/actions)
- 📏 [Semantic Versioning](https://semver.org/)
- 🛠️ [GitHub CLI](https://cli.github.com/)

---

**Happy releasing! 🚀**


