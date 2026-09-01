# Tests

Two layers, both non-interactive.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (`tests/unit`, `node --test`). Fast, no generated app. |
| `npm run test:e2e` | Generator e2e (`tests/e2e`). Calls `createApp()`, asserts files, deletes the temp project. |
| `npm run test:all` | Unit then e2e. |

```bash
npm test
npm run test:e2e
npm run test:e2e -- maps
npm run test:e2e -- app-tsx localization
npm run test:e2e -- --package-manager pnpm
npm run test:e2e -- --package-manager npm --test-pods   # macOS: also check that `pod` exists
```

Slice names are `tests/e2e/<name>.test.js` basenames (`maps`, `app-tsx`, `firebase`). Use a slice after a single-feature change; run the full e2e when apply order or shared files (`App.tsx`, Podfile, `package.json`) changed.

Do not pipe inquirer answers. Feature coverage goes through `createApp({ skipInstall, skipGit, skipPods })` in `tests/helpers/generate.js`.

`--yes` / `autoYes` leaves optional features **off**. To test a feature, pass it in the `createApp` config.

Temp projects live under `os.tmpdir()` and are removed in `after()` hooks.
