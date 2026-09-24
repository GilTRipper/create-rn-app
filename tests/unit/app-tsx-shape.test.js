const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { updateAppTsxForSetup } = require("../../src/core/update-app-tsx");
const { TEMPLATE_DIR } = require("../../src/shared/paths");

// The real template file, because with no navigation and no providers
// updateAppTsxForSetup deliberately leaves it untouched - a stub fixture would
// make that case look like a failure.
const TEMPLATE_APP_TSX = fs.readFileSync(
  path.join(TEMPLATE_DIR, "App.tsx"),
  "utf8"
);

const NAVIGATION_MODES = ["none", "app-only", "with-auth"];

async function generateAppTsx(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crna-app-tsx-"));
  try {
    fs.writeFileSync(path.join(dir, "App.tsx"), TEMPLATE_APP_TSX);
    const originalLog = console.log;
    console.log = () => {};
    try {
      await updateAppTsxForSetup(dir, setup);
    } finally {
      console.log = originalLog;
    }
    return fs.readFileSync(path.join(dir, "App.tsx"), "utf8");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// With no navigation and no providers the template App.tsx is deliberately
// kept as it is, and that file is a large demo with many return statements of
// its own. The invariant only means anything for files the generator wrote.
function wasRewritten(app) {
  return app !== TEMPLATE_APP_TSX;
}

function everyCombination() {
  const combinations = [];
  for (const navigationMode of NAVIGATION_MODES) {
    for (const themeEnabled of [false, true]) {
      for (const localizationEnabled of [false, true]) {
        for (const messagingEnabled of [false, true]) {
          combinations.push({
            navigationMode,
            themeEnabled,
            localizationEnabled,
            messagingEnabled,
          });
        }
      }
    }
  }
  return combinations;
}

describe("App.tsx shape", () => {
  // The bug this guards against: `contentJsx` is a complete `return` statement,
  // and the theme-only branch used to drop it straight inside <ThemeProvider>.
  // The result compiles and lints clean, but "return (" and ");" become JSX
  // text children, and React Native throws "Text strings must be rendered
  // within a <Text> component" on launch. Every provider branch has to wrap an
  // inner AppContent component instead.
  it("never nests a return statement inside JSX, in any combination", async () => {
    const broken = [];

    for (const setup of everyCombination()) {
      const app = await generateAppTsx(setup);
      if (!wasRewritten(app)) {
        continue;
      }
      const returnStatements = (app.match(/^\s*return[\s(]/gm) || []).length;
      if (returnStatements > 1) {
        broken.push(`${JSON.stringify(setup)} -> ${returnStatements} returns`);
      }
    }

    assert.deepEqual(broken, [], `nested return statements:\n${broken.join("\n")}`);
  });

  it("exports App exactly once in every combination", async () => {
    for (const setup of everyCombination()) {
      const app = await generateAppTsx(setup);
      assert.equal(
        (app.match(/export const App = /g) || []).length,
        1,
        JSON.stringify(setup)
      );
    }
  });

  it("wraps an inner component when a provider is involved", async () => {
    for (const setup of everyCombination()) {
      const app = await generateAppTsx(setup);
      const hasProvider =
        app.includes("<ThemeProvider>") || app.includes("<LocalizationProvider>");
      if (hasProvider) {
        assert.match(app, /<AppContent \/>/, JSON.stringify(setup));
        assert.match(app, /const AppContent = \(\) => \{/, JSON.stringify(setup));
      }
    }
  });
});
