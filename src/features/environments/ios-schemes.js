const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { getEnvNameForScheme } = require("../../shared/xcode");
const {
  addFontsToInfoPlistForPath,
  addInfoPlistsToXcodeProject,
} = require("../assets/fonts");

function buildPreActionBlock(buildableReference, env, projectName) {
  const escapedEnv = env.toLowerCase();
  const projectDirVar = "${PROJECT_DIR}";
  return `  <PreActions>
      <ExecutionAction
         ActionType = "Xcode.IDEStandardExecutionActionsCore.ExecutionActionType.ShellScriptAction">
         <ActionContent
            title = "Run Script"
            scriptText = "cp &quot;${projectDirVar}/../.env.${escapedEnv}&quot; &quot;${projectDirVar}/../.env&quot;&#10;">
            <EnvironmentBuildable>
${buildableReference}
            </EnvironmentBuildable>
         </ActionContent>
      </ExecutionAction>
   </PreActions>
`;
}

function injectPreActionIntoSection(schemeContent, tag, preAction) {
  // Remove existing PreActions within the section
  const sectionRegex = new RegExp(
    `<${tag}[^>]*>[\\s\\S]*?<\\/` + tag + `>`,
    "m"
  );
  const match = schemeContent.match(sectionRegex);
  if (!match) return schemeContent;

  let section = match[0];
  section = section.replace(/<PreActions>[\s\S]*?<\/PreActions>/g, "");
  // Insert preAction right after the opening tag
  section = section.replace(new RegExp(`(<${tag}[^>]*>)`), `$1\n${preAction}`);

  return schemeContent.replace(sectionRegex, section);
}

async function renameDefaultIosScheme(projectPath, projectName) {
  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  // Find HelloWorld scheme or any scheme that needs renaming
  const helloWorldScheme = schemeFiles.find(
    file =>
      file.includes("HelloWorld") || file.toLowerCase().includes("helloworld")
  );

  if (!helloWorldScheme) {
    // Check if there's a scheme that doesn't match projectName
    const baseScheme = schemeFiles[0];
    if (baseScheme && !baseScheme.includes(projectName)) {
      // Rename it to projectName
      const oldPath = path.join(schemesDir, baseScheme);
      const newPath = path.join(schemesDir, `${projectName}.xcscheme`);
      if (oldPath !== newPath) {
        await fs.move(oldPath, newPath, { overwrite: true });

        // Update scheme content
        let schemeContent = await fs.readFile(newPath, "utf8");
        schemeContent = schemeContent
          .replace(/HelloWorld/g, projectName)
          .replace(/helloworld/g, projectName.toLowerCase());
        await fs.writeFile(newPath, schemeContent, "utf8");
        console.log(
          chalk.green(`  ✅ Renamed scheme to ${projectName}.xcscheme`)
        );
      }
    }
    return;
  }

  const oldPath = path.join(schemesDir, helloWorldScheme);
  const newPath = path.join(schemesDir, `${projectName}.xcscheme`);

  if (oldPath !== newPath) {
    await fs.move(oldPath, newPath, { overwrite: true });

    // Update scheme content
    let schemeContent = await fs.readFile(newPath, "utf8");
    schemeContent = schemeContent
      .replace(/HelloWorld/g, projectName)
      .replace(/helloworld/g, projectName.toLowerCase());
    await fs.writeFile(newPath, schemeContent, "utf8");
    console.log(
      chalk.green(
        `  ✅ Renamed scheme from ${helloWorldScheme} to ${projectName}.xcscheme`
      )
    );
  }
}

async function createIosEnvSchemes(
  selectedEnvs,
  projectPath,
  projectName,
  buildableRefs = {},
  googleFilesByEnv = {}
) {
  const pbxprojPath = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/project.pbxproj`
  );
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const envsForSchemes = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );

  const schemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcodeproj/xcshareddata/xcschemes`
  );
  const workspaceSchemesDir = path.join(
    projectPath,
    `ios/${projectName}.xcworkspace/xcshareddata`
  );
  if (!(await fs.pathExists(schemesDir))) return;

  const schemeFiles = (await fs.readdir(schemesDir)).filter(file =>
    file.endsWith(".xcscheme")
  );
  if (schemeFiles.length === 0) return;

  const baseSchemePath = path.join(schemesDir, schemeFiles[0]);
  let baseSchemeContent = await fs.readFile(baseSchemePath, "utf8");
  baseSchemeContent = baseSchemeContent
    .replace(/HelloWorld/g, projectName)
    .replace(/helloworld/g, projectName.toLowerCase());
  const buildableMatch = baseSchemeContent.match(
    /<BuildableReference[\s\S]*?<\/BuildableReference>/
  );
  const baseBuildableReference =
    buildableRefs.base?.ref || (buildableMatch ? buildableMatch[0] : null);

  // Ensure base scheme name matches project
  const desiredBaseScheme = `${projectName}.xcscheme`;
  if (path.basename(baseSchemePath) !== desiredBaseScheme) {
    await fs.move(baseSchemePath, path.join(schemesDir, desiredBaseScheme), {
      overwrite: true,
    });
  }

  if (!baseBuildableReference) return;

  // Create Info.plist copies for each env scheme (excluding production)
  // Info.plist files are created in ios/ directory, not in projectName subdirectory
  const baseInfoPlist = path.join(projectPath, `ios/${projectName}/Info.plist`);

  // First, ensure base Info.plist has fonts (used by production)
  // Get font files from assets/fonts and update base Info.plist BEFORE copying
  const fontsDir = path.join(projectPath, "assets", "fonts");
  let fontFiles = [];
  if (await fs.pathExists(fontsDir)) {
    fontFiles = (await fs.readdir(fontsDir)).filter(file =>
      /\.(ttf|otf|ttc|woff|woff2)$/i.test(file)
    );
    if (fontFiles.length > 0 && (await fs.pathExists(baseInfoPlist))) {
      // Update base Info.plist (production uses this) before copying
      await addFontsToInfoPlistForPath(baseInfoPlist, fontFiles);
    }
  }

  // Now copy the updated base Info.plist for each environment
  const envInfoPlists = [];
  for (const env of envsForSchemes) {
    const envPlistFileName = `${projectName} ${env}-Info.plist`;
    const envPlistPath = path.join(
      projectPath,
      `ios/${projectName}/${envPlistFileName}`
    );
    if (await fs.pathExists(baseInfoPlist)) {
      await fs.copy(baseInfoPlist, envPlistPath, { overwrite: true });
      envInfoPlists.push({
        env,
        path: envPlistPath,
        fileName: envPlistFileName,
      });
    }
  }

  // Update all environment Info.plist files with fonts (they should already have them from copy, but ensure)
  if (fontFiles.length > 0) {
    for (const { path: envPlistPath } of envInfoPlists) {
      await addFontsToInfoPlistForPath(envPlistPath, fontFiles);
    }
  }

  // Add Info.plist files to Xcode project
  await addInfoPlistsToXcodeProject(
    projectPath,
    projectName,
    envInfoPlists,
    pbxprojPath
  );

  // Always add pre-actions to production/base scheme (.env.production)
  console.log(chalk.blue(`  Updating production scheme: ${desiredBaseScheme}`));
  const prodPreAction = buildPreActionBlock(
    baseBuildableReference,
    "production",
    projectName
  );
  let prodSchemeContent = baseSchemeContent.replace(
    /<Scheme[^>]*>/,
    `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "BuildAction",
    prodPreAction
  );
  prodSchemeContent = injectPreActionIntoSection(
    prodSchemeContent,
    "LaunchAction",
    prodPreAction
  );
  await fs.writeFile(
    path.join(schemesDir, desiredBaseScheme),
    prodSchemeContent,
    "utf8"
  );
  console.log(chalk.green(`  ✅ Production scheme updated`));

  for (const env of envsForSchemes) {
    const schemeName = `${projectName}${getEnvNameForScheme(env)}`;
    console.log(
      chalk.blue(`  Creating scheme for ${env}: ${schemeName}.xcscheme`)
    );
    const envBuildableRef =
      buildableRefs.envs?.[env]?.ref || baseBuildableReference;

    if (!buildableRefs.envs?.[env]?.ref) {
      console.log(
        chalk.yellow(
          `⚠️  Warning: No buildableRef for ${env}, using baseBuildableReference`
        )
      );
    }

    const targetPath = path.join(schemesDir, `${schemeName}.xcscheme`);
    let schemeContent = baseSchemeContent.replace(
      /<Scheme[^>]*>/,
      `<Scheme LastUpgradeVersion = "1610" version = "1.7">`
    );

    // CRITICAL: Replace ALL BuildableReference in scheme with environment-specific one
    // This ensures the scheme uses the correct executable (lepimvarimStaging.app instead of lepimvarim.app)
    if (buildableRefs.envs?.[env]?.ref) {
      // Replace all BuildableReference blocks with the environment-specific one
      // Match BuildableReference with any whitespace/newlines
      const buildableRefRegex =
        /<BuildableReference[\s\S]*?<\/BuildableReference>/g;
      const matches = schemeContent.match(buildableRefRegex);
      if (matches && matches.length > 0) {
        schemeContent = schemeContent.replace(
          buildableRefRegex,
          envBuildableRef
        );
      } else {
        console.log(
          chalk.yellow(`⚠️  No BuildableReference found in scheme to replace`)
        );
      }
    } else {
      console.log(
        chalk.yellow(
          `⚠️  No buildableRef for ${env}, scheme will use baseBuildableReference (${
            baseBuildableReference?.match(/BuildableName = "([^"]+)"/)?.[1] ||
            "unknown"
          })`
        )
      );
    }

    // Inject pre-actions into BuildAction (replace existing PreActions)
    const preAction = buildPreActionBlock(envBuildableRef, env, projectName);
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "BuildAction",
      preAction
    );
    schemeContent = injectPreActionIntoSection(
      schemeContent,
      "LaunchAction",
      preAction
    );

    await fs.writeFile(targetPath, schemeContent, "utf8");
    console.log(chalk.green(`  ✅ Scheme ${schemeName}.xcscheme created`));

    if (workspaceSchemesDir) {
      await fs.ensureDir(workspaceSchemesDir);
    }
  }

  console.log(
    chalk.green(
      `✅ Created ${envsForSchemes.length} environment scheme(s) + production scheme`
    )
  );
}

module.exports = {
  buildPreActionBlock,
  injectPreActionIntoSection,
  renameDefaultIosScheme,
  createIosEnvSchemes,
};
