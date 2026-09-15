# Tests

Three layers, all non-interactive. Nothing pipes inquirer answers; coverage goes
through `createApp()` in `tests/helpers/generate.js`.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (`tests/unit`, `node --test`). Fast, no generated app. |
| `npm run test:e2e` | Generator e2e (`tests/e2e`). Calls `createApp()`, asserts files, deletes the temp project. |
| `npm run test:e2e:scenarios` | Only the scenario matrix (`tests/e2e/scenarios.test.js`). |
| `npm run test:e2e:deep` | Scenario matrix + installs each generated app and runs its own toolchain. |
| `npm run test:e2e:max` | Everything, including `pod install` and `gradlew assembleDebug`. |
| `npm run test:all` | Unit then e2e. |

```bash
npm test
npm run test:e2e
npm run test:e2e -- maps
npm run test:e2e -- app-tsx localization
npm run test:e2e -- --package-manager pnpm
```

Slice names are `tests/e2e/<name>.test.js` basenames (`maps`, `app-tsx`, `firebase`).
Use a slice after a single-feature change; run the full e2e when apply order or
shared files (`App.tsx`, Podfile, `package.json`) changed.

Temp projects live under `os.tmpdir()`. They are removed in `after()` hooks and,
if the run is interrupted, by the signal hooks in `tests/helpers/cleanup-registry.js`.

## Per-feature tests

`tests/e2e/<feature>.test.js` covers one feature at a time and asserts the exact
strings that feature writes. Add or update one whenever a feature changes.

## Scenario matrix

`tests/e2e/scenarios.test.js` generates the feature combinations a user actually
picks in the wizard, defined in `tests/helpers/scenarios.js`:

| Scenario | Combination |
|---|---|
| `minimal` | Template only, every optional feature off. |
| `typical` | Auth navigation, Zustand storage, theme, i18n, full UI kit, custom fonts. |
| `full` | Three environments, Firebase (analytics + remote config + messaging), Google Maps, every JS feature, custom fonts, splash and icons. |

Every scenario runs the same invariants from `tests/helpers/expectations.js`, and
each invariant checks both directions: a feature that is on must leave its
traces, a feature that is off must leave none. So adding a scenario is one config
entry — the cross-checks come for free.

```bash
npm run test:e2e:scenarios
npm run test:e2e -- scenarios --scenario full
npm run test:e2e -- scenarios --scenario minimal,typical
```

The matrix also asserts that generation prints no `❌` line and that no template
placeholder (`HelloWorld`, `helloworld`, `com.helloworld`) survives anywhere in
the tree.

## Deep and native layers

The layers below install and build the generated app, so they are opt-in: the
default run stays fast and works on the Linux CI box, which has no Xcode.

| Flag | Adds |
|---|---|
| `--deep` | `install`, `tsc --noEmit`, `eslint .`, Metro bundle for ios and android. |
| `--pod-install` | `pod install` (macOS only). Implies `--deep`. |
| `--gradle` | `./gradlew assembleDebug`. Implies `--deep`. |
| `--max` | All of the above. |

```bash
npm run test:e2e:deep
npm run test:e2e -- scenarios --deep --scenario typical
npm run test:e2e:max
```

Requirements, checked by a preflight test before anything is installed:

- **Node >= 22.11.0** — the generated app's `engines` field. `nvm use 22` first;
  the repo's own tests run on older Node, the generated app does not.
- **pnpm** — deep runs default to it because the template ships `pnpm-lock.yaml`
  and `pnpm.patchedDependencies`. `npm install` silently skips those patches.
  Override with `--package-manager npm` when you specifically want to test that.
- `--pod-install` needs macOS and CocoaPods; `--gradle` needs a JDK.

Each layer only runs after the install for that scenario succeeded; otherwise the
dependent checks are skipped rather than failing with noise.

`--gradle` on the `full` scenario assembles four product flavors, so a single
`npm run test:e2e:max` over all three scenarios can exhaust memory on a loaded
machine. That shows up as gradle worker tasks (`mergeDebugJavaResource`,
`packageProductionDebug`) failing with no error of their own. Re-run the
scenario on its own before reading it as a real failure:

```bash
npm run test:e2e -- scenarios --gradle --scenario full
```

## Adding coverage

New helper: add `tests/unit/<name>.test.js`. New feature: add
`tests/e2e/<name>.test.js` and an invariant in `tests/helpers/expectations.js` so
every scenario checks it. Touching a shared file (`App.tsx`, Podfile,
`package.json`) means updating the suites that already cover it.
