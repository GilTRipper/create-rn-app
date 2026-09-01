---
name: add-feature
description: Add an optional create-rn-app feature (prompt + apply + orchestrator wiring + createApp test). Use when adding a CLI option, inquirer flow, template-preset, or src/features module.
---

# Add a feature

Do not invent a plugin registry. Wire the feature in the two orchestrators.

## Checklist

1. `src/features/<name>/prompt.js` — mutate `ctx.config`; if `ctx.options.yes`, set disabled defaults and return.
2. `src/features/<name>/apply.js` — write files under `ctx.config.projectPath` only when enabled.
3. `src/features/<name>/index.js` — `module.exports = { prompt, apply }` (`auth` is apply-only).
4. Call `prompt` from `src/get-prompts.js` in dependency order (env → firebase → maps → storage → navigation → localization → theme → ui-kit).
5. Call `apply` from `src/core/create-app.js` in the existing apply order (fonts → envs → firebase → storage → auth → nav → i18n → theme → ui-kit → App.tsx → firebase Xcode → maps).
6. Preset sources go in `template-presets/<name>/`. UI components go in `ui-templates/` + `src/features/ui-kit/`, not the base `template/package.json`.
7. CLI flag (if any) in `src/index.js`. Do not add flags the user did not ask for.
8. Add or update `tests/e2e/<name>.test.js` (and unit tests for new helpers). If the feature writes `App.tsx` / Podfile / `package.json`, update those suites too.
9. Run `npm test` and the matching e2e (`npm run test:e2e` or the new file). Follow [verify-cli](../verify-cli/SKILL.md). No interactive stdin.

## Config

Keep the public `config` shape stable unless the user asked to change it. New fields default to disabled.

## Forbidden

Do not bump `template/package.json` versions or edit `.npmignore` / workflows unless the user asked and approved.
