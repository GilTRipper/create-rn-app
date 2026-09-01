# create-rn-app

CLI `@giltripper/create-rn-app`, command `create-rn-app`. Scaffolds a React Native app (template + optional feature presets).

Long human guide: [DEVELOPMENT.md](DEVELOPMENT.md). Cursor extras: [.cursor/](.cursor/).

## Non-negotiables

- Node `>= 22.11.0` for the CLI and generated apps.
- **Do not** change without an explicit user request **and** approval:
  - `template/package.json` versions
  - `.npmignore`
  - CI/CD: `.github/workflows/*` (explain why first, then wait)
  - Native template churn “just in case”: `template/android/**` gradle wrapper, `template/ios/**/*.pbxproj`
- Do not commit or push unless asked. No force-push, no hook skips.
- Do not grow god files. `src/prompts.js` and `src/template.js` stay thin facades.

## Layout (where to edit)

| What | Where |
|---|---|
| CLI flags | `src/index.js` |
| Prompt order | `src/get-prompts.js` |
| Apply order | `src/core/create-app.js` |
| Feature Q&A + codegen | `src/features/<name>/prompt.js` + `apply.js` |
| Copy / rename / App.tsx / install | `src/core/` |
| Shared paths / Xcode ids | `src/shared/` |
| Base RN app | `template/` |
| Optional JS presets | `template-presets/` |
| Optional UI components | `ui-templates/` + `src/features/ui-kit/` |
| Copied Firebase lib sources | `src/firebase-lib-modules/` (not CLI logic) |

`src/prompts.js` → `getPrompts`. `src/template.js` → `createApp`.

## Feature contract

Features read/write `ctx.config` only. They do **not** call other features.

Orchestrators own order (fonts before iOS targets, GoogleServices in Xcode after targets, App.tsx after features, maps after App.tsx).

`auth` is apply-only; the prompt lives in `navigation` (`navigationMode === "with-auth"`).

Do **not** refactor the internals of `createIosTargetsForEnvs` (`src/features/environments/ios-targets.js`). Move-only, no algorithm rewrite.

Зачем: один файл на фичу проще менять; порядок apply хрупкий — его нельзя спрятать в `forEach`.

## Language / TS later

`src/**` is CommonJS JavaScript today. Keep that. A TypeScript migration is planned — new code should stay TS-friendly: named functions, explicit `module.exports`, no extra CJS-only hacks, no new runtime deps without a reason.

Generated template apps are TypeScript (`.tsx`). Do not convert the CLI in passing.

## Tests

After a feature, `src/` change, template/preset edit, or package bump: run tests and fix what broke.

- `npm test` — unit (`tests/unit`). Fast. Always after helper/utils/catalog changes.
- `npm run test:e2e` — generator e2e (`createApp`, no stdin). Slice: `npm run test:e2e -- maps`. After feature apply, template, or preset changes.
- New block: add a test in the same change. If you touch a shared file (`App.tsx`, Podfile, `package.json`), update the suites that already cover it.
- Proof is `createApp({ skipInstall: true, skipGit: true, skipPods: true, ... })`. Do **not** pipe inquirer answers.

After CLI/feature changes, follow [.cursor/skills/verify-cli/SKILL.md](.cursor/skills/verify-cli/SKILL.md). After adding a feature, follow [.cursor/skills/add-feature/SKILL.md](.cursor/skills/add-feature/SKILL.md).
