const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

function isNodeVersionSupported(nodeVersion) {
  const [major, minor] = String(nodeVersion)
    .split(".")
    .map(part => parseInt(part, 10));

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }

  return !(major < 22 || (major === 22 && minor < 11));
}

function checkNodeVersion() {
  const nodeVersion = process.versions.node;

  if (!isNodeVersionSupported(nodeVersion)) {
    console.error(
      chalk.red("Error: Node.js version 22.11.0 or higher is required."),
      chalk.yellow(`\nYou are currently running Node.js ${nodeVersion}`)
    );
    process.exit(1);
  }
}

function checkPackageManager(packageManager) {
  try {
    const { execSync } = require('child_process');
    execSync(`${packageManager} --version`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error(
      chalk.red(`\n❌ Error: ${packageManager} is not installed.`),
      chalk.yellow(`\nPlease install ${packageManager} first:`)
    );
    
    if (packageManager === 'pnpm') {
      console.log(chalk.cyan('  npm install -g pnpm'));
      console.log(chalk.gray('  or visit: https://pnpm.io/installation'));
    } else if (packageManager === 'yarn') {
      console.log(chalk.cyan('  npm install -g yarn'));
      console.log(chalk.gray('  or visit: https://yarnpkg.com/getting-started/install'));
    }
    console.log('');
    return false;
  }
}

async function replaceInFile(filePath, replacements) {
  try {
    let content = await fs.readFile(filePath, 'utf8');

    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      content = content.replace(regex, replacements[key]);
    });

    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    // File might not exist, skip
    console.log(chalk.yellow(`Warning: Could not replace in ${filePath}`));
  }
}

async function replaceInFilesRecursively(dirPath, replacements, extensions = ['.js', '.ts', '.tsx', '.json', '.xml', '.gradle', '.kt', '.swift']) {
  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      // Skip certain directories
      if (!['node_modules', '.git', 'build', 'Pods'].includes(file)) {
        await replaceInFilesRecursively(filePath, replacements, extensions);
      }
    } else if (stat.isFile()) {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        await replaceInFile(filePath, replacements);
      }
    }
  }
}

module.exports = {
  isNodeVersionSupported,
  checkNodeVersion,
  checkPackageManager,
  replaceInFile,
  replaceInFilesRecursively
};

