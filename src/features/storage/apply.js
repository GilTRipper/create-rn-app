const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

async function apply(ctx) {
  const {
    projectPath,
    zustandStorage = false,
    navigationMode = "none",
    localization = {},
    theme = false,
  } = ctx.config;

  const localizationEnabled = localization?.enabled || false;
  const themeEnabled = theme || false;
  const needsZustandStorage = zustandStorage || navigationMode === "with-auth";
  if (!needsZustandStorage) {
    return;
  }

  const libPath = path.join(projectPath, "src/lib");
  await fs.ensureDir(libPath);

  const storageFilePath = path.join(libPath, "storage.ts");
  if (!(await fs.pathExists(storageFilePath))) {
    const storageContent = `import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

const storage = createMMKV();

export const zustandStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: name => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: name => storage.remove(name),
};
`;

    await fs.writeFile(storageFilePath, storageContent, "utf8");

    if (!zustandStorage && navigationMode === "with-auth") {
      console.log(
        chalk.green(
          "✅ Created Zustand storage setup (required for auth navigation)"
        )
      );
    } else if (zustandStorage && (localizationEnabled || themeEnabled)) {
      const reasons = [];
      if (navigationMode === "with-auth") reasons.push("auth navigation");
      if (localizationEnabled) reasons.push("localization");
      if (themeEnabled) reasons.push("theme");
      console.log(
        chalk.green(
          `✅ Created Zustand storage setup (for ${reasons.join(" + ")})`
        )
      );
    } else {
      console.log(chalk.green("✅ Created Zustand storage setup"));
    }
  } else if (
    navigationMode === "with-auth" ||
    (zustandStorage && (localizationEnabled || themeEnabled))
  ) {
    console.log(
      chalk.green(
        "✅ Zustand storage already exists (required for selected features)"
      )
    );
  }
}

module.exports = { apply };
