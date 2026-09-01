const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { TEMPLATE_PRESETS } = require("../../shared/paths");

async function copyNotificationsTemplate(projectPath) {
  const sourceNotificationsPath = path.join(TEMPLATE_PRESETS, "notifications");

  if (!(await fs.pathExists(sourceNotificationsPath))) {
    console.log(
      chalk.yellow(
        `⚠️  Notifications template directory not found: ${sourceNotificationsPath}. Skipping notifications template copy.`
      )
    );
    return;
  }

  const targetNotificationsPath = path.join(projectPath, "src/notifications");
  await fs.ensureDir(path.dirname(targetNotificationsPath));

  await fs.copy(sourceNotificationsPath, targetNotificationsPath, {
    overwrite: true,
  });
  console.log(chalk.green("✅ Copied notifications template"));
}

async function enableAndroidPostNotificationsPermission(projectPath) {
  const srcDir = path.join(projectPath, "android/app/src");
  if (!(await fs.pathExists(srcDir))) return;

  const entries = await fs.readdir(srcDir);
  for (const entry of entries) {
    const manifestPath = path.join(srcDir, entry, "AndroidManifest.xml");
    if (!(await fs.pathExists(manifestPath))) continue;

    let content = await fs.readFile(manifestPath, "utf8");
    if (content.includes('android.permission.POST_NOTIFICATIONS')) {
      // Uncomment if commented
      content = content.replace(
        /<!--\s*<uses-permission android:name="android\.permission\.POST_NOTIFICATIONS"\s*\/>\s*-->/g,
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
      );
      await fs.writeFile(manifestPath, content, "utf8");
    }
  }
}

async function enableIosRemoteNotificationsBackgroundMode(projectPath) {
  const iosDir = path.join(projectPath, "ios");
  if (!(await fs.pathExists(iosDir))) return;

  const entries = await fs.readdir(iosDir);
  for (const entry of entries) {
    const candidateDir = path.join(iosDir, entry);
    const stat = await fs.stat(candidateDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    // Update main Info.plist + any env-specific Info.*.plist if present
    const files = await fs.readdir(candidateDir).catch(() => []);
    for (const file of files) {
      if (!/^Info(\..+)?\.plist$/.test(file)) continue;
      const plistPath = path.join(candidateDir, file);
      let content = await fs.readFile(plistPath, "utf8");

      if (content.includes("<key>UIBackgroundModes</key>")) {
        // Ensure remote-notification present
        if (!content.includes("<string>remote-notification</string>")) {
          content = content.replace(
            /<key>UIBackgroundModes<\/key>\s*<array>/,
            `<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>`
          );
        }
      } else {
        // Add UIBackgroundModes before closing </dict>
        content = content.replace(
          /<\/dict>\s*<\/plist>/,
          `\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>`
        );
      }

      await fs.writeFile(plistPath, content, "utf8");
    }
  }
}


async function apply(ctx) {
  const { projectPath, firebase = {} } = ctx.config;
  const firebaseEnabled = firebase?.enabled || false;
  const firebaseModules = firebase?.modules || [];
  const messagingEnabled =
    firebaseEnabled && Array.isArray(firebaseModules)
      ? firebaseModules.includes("messaging")
      : false;
  if (!messagingEnabled) {
    return;
  }
  await copyNotificationsTemplate(projectPath);
  await enableAndroidPostNotificationsPermission(projectPath);
  await enableIosRemoteNotificationsBackgroundMode(projectPath);
}

module.exports = {
  apply,
  copyNotificationsTemplate,
  enableAndroidPostNotificationsPermission,
  enableIosRemoteNotificationsBackgroundMode,
};
