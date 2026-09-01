# Bugbot — create-rn-app

CLI that scaffolds a React Native app. Review the **generator** (`src/`, `template/`, `template-presets/`, `ui-templates/`, `tests/`), not a running mobile app.

`.cursor/rules/*.mdc` are not loaded here. This file is the review contract.

## Flag these

### Guarded paths (blocking unless the PR text asks and approves)

- `template/package.json` version bumps
- `.npmignore`
- `.github/workflows/*`
- Drive-by native churn: `template/android/**` gradle wrapper, `template/ios/**/*.pbxproj`

### Fragile algorithms (blocking)

- Any behavior rewrite of `createIosTargetsForEnvs` in `src/features/environments/ios-targets.js`. File moves only. Regex/pbxproj edits without a failing test first are a bug.

### Architecture (blocking)

- Features importing other `src/features/*` (allowed exception already in tree: `environments/ios-schemes.js` → assets/fonts helpers). Do not add new cross-feature imports.
- Growing `src/prompts.js` or `src/template.js` past thin facades (`getPrompts` / `createApp`).
- Hiding apply order in a `forEach` / plugin registry. Order stays explicit in `src/get-prompts.js` and `src/core/create-app.js`.
- Starting a TypeScript migration of `src/**` (CommonJS JS today; generated apps stay `.tsx`).
- New runtime dependencies without a stated reason.

### Tests (blocking)

- New feature, helper, or apply branch without a test in the same PR.
- Edits that write `App.tsx`, Podfile, or generated `package.json` without updating the suites that already cover those files (`tests/e2e/app-tsx.test.js`, maps, localization, navigation, firebase).
- Proof that is not `createApp({ skipInstall: true, skipGit: true, skipPods: true })`. Flag piping inquirer stdin, or treating `npm install` / `pod install` in the generated app as the review check.

Known apply order (do not “simplify”): fonts → envs → firebase → storage → auth → nav → i18n → theme → ui-kit → App.tsx → firebase Xcode → maps.

`auth` is apply-only; the prompt lives in navigation (`navigationMode === "with-auth"`).

## Do not flag

- Missing `npm install` / `pod install` / device boot of a generated app.
- Commits not pushed, or lack of a changelog, unless the PR claims a release.
- Comments or docs-only wording that does not change generator output.

## How to comment

Title the finding with the rule (guarded path, ios-targets, feature import, missing test). Point at the file and say what to do instead (add `tests/e2e/<feature>.test.js`, keep the orchestrator call explicit, revert the guarded file).
