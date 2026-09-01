---
name: verify-cli
description: Verify create-rn-app changes via createApp() smoke tests. Use after editing src/, features, template generation, or when asked to test the CLI.
---

# Verify the CLI

After any `src/`, feature, template, preset, or package change: run tests and fix failures.

1. `npm test` — unit (`tests/unit`).
2. Touched a feature or generated files: `npm run test:e2e` or a slice (`npm run test:e2e -- maps`). Full e2e if apply order or shared files (`App.tsx`, Podfile, `package.json`) changed.
3. New helper: add `tests/unit/<name>.test.js`. New feature: add/update `tests/e2e/<name>.test.js` via `generateProject` in `tests/helpers/generate.js`. Update suites that cover files you changed (`App.tsx`, Podfile, `package.json`).

Cheap extra smoke is still `createApp` from `src/template.js` with installs skipped. Use `tests/helpers/generate.js` instead of inventing a new wrapper.

Do not spawn `create-rn-app` and pipe inquirer answers. `--yes` leaves optional features off.

## Do not

- Treat TTY/inquirer logs as a pass.
- `npm install` / `pod install` in the generated app unless asked.
- Leave temp projects behind; `generateProject` + `cleanup` already handle that.
