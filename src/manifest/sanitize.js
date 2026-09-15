// The manifest is committed to the user's repository, so the config snapshot is
// built from an allowlist rather than by deleting known-bad keys: a feature that
// starts collecting a new token later must not silently leak it into every
// generated project.
function sanitizeConfig(config) {
  return {
    projectName: config.projectName,
    bundleIdentifier: config.bundleIdentifier,
    displayName: config.displayName,
    packageManager: config.packageManager,
    envSetupSelectedEnvs: [...(config.envSetupSelectedEnvs || [])],
    navigationMode: config.navigationMode || "none",
    theme: Boolean(config.theme),
    zustandStorage: Boolean(config.zustandStorage),
    firebase: {
      enabled: Boolean(config.firebase?.enabled),
      modules: [...(config.firebase?.modules || [])],
      // Paths to the user's Google config files stay out. Which environments
      // were wired up is enough to describe and replay the setup.
      googleFilesEnvs: Object.keys(
        config.firebase?.googleFiles?.filesByEnv || {}
      ),
    },
    maps: {
      enabled: Boolean(config.maps?.enabled),
      provider: config.maps?.provider ?? null,
    },
    localization: {
      enabled: Boolean(config.localization?.enabled),
      defaultLanguage: config.localization?.defaultLanguage ?? null,
      withRemoteConfig: Boolean(config.localization?.withRemoteConfig),
    },
    uiKit: {
      enabled: Boolean(config.uiKit?.enabled),
      components: [...(config.uiKit?.components || [])],
    },
    // The directories the user pointed at are machine-specific; only the fact
    // that custom assets were supplied survives.
    assets: {
      fonts: Boolean(config.fontsDir),
      splashScreen: Boolean(config.splashScreenDir),
      appIcon: Boolean(config.appIconDir),
    },
  };
}

module.exports = { sanitizeConfig };
