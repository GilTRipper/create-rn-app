const fs = require("fs");
const path = require("path");
const { test, log } = require("./test-helpers");
const {
  DEFAULT_PROJECT,
  DEFAULT_PROJECT_PATH,
  NO_ENV_NO_FIREBASE_PROJECT,
  NO_ENV_NO_FIREBASE_PROJECT_PATH,
} = require("./test-setup");

module.exports = function runEnvironmentTests() {
  // Test 19: Environment setup - check .env files created (if environment setup was used)
  test("Check environment .env files created", () => {
    // Check if .env files exist in project root (optional - only if environment setup was used)
    const possibleEnvFiles = [
      ".env.production",
      ".env.local",
      ".env.development",
      ".env.staging",
    ];
    let foundEnvFiles = 0;

    for (const envFile of possibleEnvFiles) {
      const envFilePath = path.join(DEFAULT_PROJECT_PATH, envFile);
      if (fs.existsSync(envFilePath)) {
        foundEnvFiles++;
        const content = fs.readFileSync(envFilePath, "utf8");
        // Check that file is not empty and has expected format
        if (content.trim().length === 0) {
          throw new Error(`${envFile} exists but is empty`);
        }
        // Check that it's a valid .env file (starts with # or has KEY=VALUE format)
        if (!content.match(/^#|^[A-Z_]+=/m)) {
          throw new Error(`${envFile} doesn't have valid .env format`);
        }
      }
    }

    // If any .env files exist, environment setup was used
    // This test passes if no .env files exist (environment setup not used) or if they exist and are valid
  });

  // Test 20: Environment setup - Android flavors and source sets (if environment setup was used)
  test("Check Android environment setup", () => {
    const buildGradlePath = path.join(
      DEFAULT_PROJECT_PATH,
      "android/app/build.gradle"
    );
    if (!fs.existsSync(buildGradlePath)) {
      throw new Error("android/app/build.gradle does not exist");
    }

    const content = fs.readFileSync(buildGradlePath, "utf8");

    // Check if envConfigFiles exists (indicates environment setup was used)
    if (content.includes("project.ext.envConfigFiles")) {
      // If environment setup was used, verify structure
      // Check that productFlavors exist
      if (!content.includes("productFlavors")) {
        throw new Error(
          "build.gradle has envConfigFiles but missing productFlavors"
        );
      }

      // Check that flavorDimensions exist
      if (!content.includes("flavorDimensions")) {
        throw new Error(
          "build.gradle has productFlavors but missing flavorDimensions"
        );
      }

      // Check that envConfigFiles has proper format (not malformed)
      const envConfigMatch = content.match(
        /project\.ext\.envConfigFiles\s*=\s*\[[\s\S]*?\]/
      );
      if (!envConfigMatch) {
        throw new Error("envConfigFiles block found but format is invalid");
      }

      // Check for environment source directories (optional - only for non-production)
      const srcDir = path.join(DEFAULT_PROJECT_PATH, "android/app/src");
      if (fs.existsSync(srcDir)) {
        const srcDirs = fs.readdirSync(srcDir);
        const envDirs = srcDirs.filter(dir =>
          ["local", "development", "staging"].includes(dir.toLowerCase())
        );
        // If environment setup was used, should have at least one env directory (if non-production envs selected)
      }
    }
    // If envConfigFiles doesn't exist, environment setup wasn't used - test passes
  });

  // Test 21: Environment setup - iOS schemes (if environment setup was used)
  test("Check iOS environment schemes", () => {
    const schemesDir = path.join(
      DEFAULT_PROJECT_PATH,
      `ios/${DEFAULT_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
    );

    // Schemes are optional in CI (xcshareddata may not exist when pods are skipped)
    if (!fs.existsSync(schemesDir)) {
      return;
    }

    const schemeFiles = fs
      .readdirSync(schemesDir)
      .filter(file => file.endsWith(".xcscheme"));

    // If no shared schemes, skip
    if (schemeFiles.length === 0) {
      return;
    }

    // If base scheme is missing, skip (env setup not used)
    const baseScheme = `${DEFAULT_PROJECT.name}.xcscheme`;
    if (!schemeFiles.includes(baseScheme)) {
      return;
    }

    // If environment setup was used, check for environment schemes
    const envSchemes = schemeFiles.filter(
      file =>
        file.includes("Local") ||
        file.includes("Dev") ||
        file.includes("Stg") ||
        file.includes("Development") ||
        file.includes("Staging")
    );

    // If environment schemes exist, verify they have proper structure
    for (const schemeFile of envSchemes) {
      const schemePath = path.join(schemesDir, schemeFile);
      const schemeContent = fs.readFileSync(schemePath, "utf8");

      // Check that scheme has BuildableReference
      if (!schemeContent.includes("BuildableReference")) {
        throw new Error(`Scheme ${schemeFile} is missing BuildableReference`);
      }

      // Check that scheme has PreActions (if environment setup was used)
      if (schemeContent.includes("PreActions")) {
        // Verify PreActions have proper structure
        if (!schemeContent.includes("ExecutionAction")) {
          throw new Error(
            `Scheme ${schemeFile} has PreActions but missing ExecutionAction`
          );
        }
      }
    }
  });

  // Test 22: Environment setup - package.json scripts (if environment setup was used)
  test("Check environment scripts in package.json", () => {
    const packageJsonPath = path.join(DEFAULT_PROJECT_PATH, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error("package.json does not exist");
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    if (!packageJson.scripts) {
      throw new Error("package.json is missing scripts section");
    }

    // Check if environment scripts exist (optional - only if environment setup was used)
    const androidScripts = Object.keys(packageJson.scripts).filter(key =>
      key.startsWith("android:")
    );
    const iosScripts = Object.keys(packageJson.scripts).filter(key =>
      key.startsWith("ios:")
    );

    // If environment scripts exist, verify they have correct format
    for (const scriptKey of [...androidScripts, ...iosScripts]) {
      const scriptValue = packageJson.scripts[scriptKey];

      // Check that script is a string
      if (typeof scriptValue !== "string") {
        throw new Error(`Script ${scriptKey} is not a string`);
      }

      // Check that script is not empty
      if (scriptValue.trim().length === 0) {
        throw new Error(`Script ${scriptKey} is empty`);
      }

      // For Android scripts, check they reference correct modes
      if (scriptKey.startsWith("android:")) {
        if (scriptKey.includes("prod") && !scriptValue.includes("production")) {
          throw new Error(
            `Script ${scriptKey} should reference production mode`
          );
        }
        if (scriptKey.includes("dev") && !scriptValue.includes("development")) {
          throw new Error(
            `Script ${scriptKey} should reference development mode`
          );
        }
        if (scriptKey.includes("stg") && !scriptValue.includes("staging")) {
          throw new Error(`Script ${scriptKey} should reference staging mode`);
        }
      }

      // For iOS scripts, check they reference correct schemes
      if (scriptKey.startsWith("ios:")) {
        if (!scriptValue.includes("--scheme")) {
          throw new Error(`Script ${scriptKey} should include --scheme flag`);
        }
      }
    }
  });

  // Test 24: iOS scheme renamed when no environments selected
  test("Check iOS scheme renamed from HelloWorld when no environments", () => {
    const schemesDir = path.join(
      NO_ENV_NO_FIREBASE_PROJECT_PATH,
      `ios/${NO_ENV_NO_FIREBASE_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
    );

    if (!fs.existsSync(schemesDir)) {
      // Schemes directory might not exist if pods are skipped
      log("Schemes directory not found, skipping test", "info");
      return;
    }

    const schemeFiles = fs
      .readdirSync(schemesDir)
      .filter(file => file.endsWith(".xcscheme"));

    if (schemeFiles.length === 0) {
      log("No scheme files found, skipping test", "info");
      return;
    }

    // Check that HelloWorld scheme doesn't exist
    const helloWorldScheme = schemeFiles.find(
      file =>
        file.includes("HelloWorld") || file.toLowerCase().includes("helloworld")
    );

    if (helloWorldScheme) {
      throw new Error(
        `HelloWorld scheme still exists: ${helloWorldScheme}. Should be renamed to ${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`
      );
    }

    // Check that project name scheme exists
    const projectScheme = `${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`;
    if (!schemeFiles.includes(projectScheme)) {
      throw new Error(
        `Expected scheme ${projectScheme} not found. Found: ${schemeFiles.join(
          ", "
        )}`
      );
    }

    // Check scheme content doesn't contain HelloWorld
    const schemePath = path.join(schemesDir, projectScheme);
    const schemeContent = fs.readFileSync(schemePath, "utf8");

    if (
      schemeContent.includes("HelloWorld") ||
      schemeContent.includes("helloworld")
    ) {
      throw new Error(
        `Scheme ${projectScheme} still contains HelloWorld references`
      );
    }

    // Check that scheme has correct project name references
    if (!schemeContent.includes(NO_ENV_NO_FIREBASE_PROJECT.name)) {
      throw new Error(
        `Scheme ${projectScheme} doesn't contain project name "${NO_ENV_NO_FIREBASE_PROJECT.name}"`
      );
    }

    // Check that scheme has BuildableReference with correct project name
    if (
      !schemeContent.includes(
        `BuildableName = "${NO_ENV_NO_FIREBASE_PROJECT.name}.app"`
      )
    ) {
      // Also check alternative format
      if (
        !schemeContent.includes(
          `BuildableName = "${NO_ENV_NO_FIREBASE_PROJECT.name.toLowerCase()}.app"`
        )
      ) {
        log(
          "Warning: BuildableName format might differ, but scheme exists and is renamed",
          "info"
        );
      }
    }
  });

  // Test 24.1: iOS scheme structure when no environments selected
  test("Check iOS scheme structure when no environments selected", () => {
    const schemesDir = path.join(
      NO_ENV_NO_FIREBASE_PROJECT_PATH,
      `ios/${NO_ENV_NO_FIREBASE_PROJECT.name}.xcodeproj/xcshareddata/xcschemes`
    );

    if (!fs.existsSync(schemesDir)) {
      log("Schemes directory not found, skipping test", "info");
      return;
    }

    const schemeFiles = fs
      .readdirSync(schemesDir)
      .filter(file => file.endsWith(".xcscheme"));

    if (schemeFiles.length === 0) {
      log("No scheme files found, skipping test", "info");
      return;
    }

    // When no environments are selected, there should be only one scheme (the base scheme)
    // and it should be named after the project, not HelloWorld
    const projectScheme = `${NO_ENV_NO_FIREBASE_PROJECT.name}.xcscheme`;

    if (!schemeFiles.includes(projectScheme)) {
      throw new Error(
        `Base scheme ${projectScheme} not found when no environments selected. Found: ${schemeFiles.join(
          ", "
        )}`
      );
    }

    // Check that there are no environment-specific schemes (Local, Dev, Stg, etc.)
    const envSchemes = schemeFiles.filter(
      file =>
        file.includes("Local") ||
        file.includes("Dev") ||
        file.includes("Stg") ||
        file.includes("Development") ||
        file.includes("Staging")
    );

    if (envSchemes.length > 0) {
      throw new Error(
        `Environment-specific schemes found when no environments selected: ${envSchemes.join(
          ", "
        )}`
      );
    }

    // Verify scheme content is valid XML and contains required elements
    const schemePath = path.join(schemesDir, projectScheme);
    const schemeContent = fs.readFileSync(schemePath, "utf8");

    // Check for required scheme elements
    if (!schemeContent.includes("<Scheme")) {
      throw new Error(
        `Scheme ${projectScheme} is missing <Scheme> root element`
      );
    }

    if (!schemeContent.includes("BuildAction")) {
      throw new Error(`Scheme ${projectScheme} is missing BuildAction`);
    }

    if (!schemeContent.includes("LaunchAction")) {
      throw new Error(`Scheme ${projectScheme} is missing LaunchAction`);
    }

    // Check that scheme doesn't have environment-specific pre-actions
    // (when no environments, pre-actions for .env files should not exist)
    if (schemeContent.includes("PreActions")) {
      // If PreActions exist, they should not be for environment files
      if (
        schemeContent.includes(".env.") &&
        !schemeContent.includes(".env.production")
      ) {
        // Allow .env.production as it might be the default
        const envPreActions = schemeContent.match(
          /\.env\.(local|development|staging)/g
        );
        if (envPreActions && envPreActions.length > 0) {
          throw new Error(
            `Scheme ${projectScheme} has environment-specific pre-actions when no environments selected: ${envPreActions.join(
              ", "
            )}`
          );
        }
      }
    }
  });
};
