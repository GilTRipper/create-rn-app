const fs = require("fs-extra");
const path = require("path");
const { getEnvNameForScheme } = require("../../shared/xcode");

async function updatePodfileForEnvs(
  selectedEnvs,
  projectPath,
  projectName,
  { firebaseEnabled = false, firebaseModules = [] } = {}
) {
  if (!selectedEnvs || selectedEnvs.length < 1) return;

  const podfilePath = path.join(projectPath, "ios/Podfile");
  if (!(await fs.pathExists(podfilePath))) return;

  const envsForTargets = selectedEnvs.filter(
    env => env.toLowerCase() !== "production"
  );
  const targets = envsForTargets.map(
    env => `${projectName}${getEnvNameForScheme(env)}`
  );

  // Add prod target when multiple environments are created
  const prodTargetBlock = `  target '${projectName}' do
  end
`;

  const targetBlocks =
    targets
      .map(
        target => `  target '${target}' do
  end
`
      )
      .join("\n") + prodTargetBlock;

  const firebaseFlags = firebaseEnabled
    ? `$RNFirebaseDisableSPM = true${
        firebaseModules.includes("analytics")
          ? "\n$RNFirebaseAnalyticsWithoutAdIdSupport = true"
          : ""
      }\n\n`
    : "";

  const firebasePods = firebaseEnabled
    ? `  pod 'FirebaseCore', :modular_headers => true
  pod 'GoogleUtilities', :modular_headers => true
${
  firebaseModules.includes("remote-config")
    ? `  pod 'FirebaseRemoteConfig', :modular_headers => true
  pod 'FirebaseABTesting', :modular_headers => true
  pod 'FirebaseInstallations', :modular_headers => true
`
    : ""
}
`
    : "";

  const podfileContent = `def node_require(script)
  # Resolve script with node to allow for hoisting
  require Pod::Executable.execute_command('node', ['-p',
    "require.resolve(
     '\#{script}',
     {paths: [process.argv[1]]},
    )", __dir__]).strip
end

# Use it to require both react-native's and this package's scripts:
node_require('react-native/scripts/react_native_pods.rb')
node_require('react-native-permissions/scripts/setup.rb')

${firebaseFlags}platform :ios, min_ios_version_supported
prepare_react_native_project!

setup_permissions([
  'Camera',
  'LocationAccuracy',
  'LocationAlways',
  'LocationWhenInUse',
  'MediaLibrary',
  'PhotoLibrary',
  'PhotoLibraryAddOnly'
])

linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with \#{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
end

abstract_target '${projectName}CommonPods' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "\#{Pod::Config.instance.installation_root}/.."
  )

${firebasePods}  # Google Maps для react-native-maps
  rn_maps_path = '../node_modules/react-native-maps'
  pod 'react-native-maps/Google', :path => rn_maps_path

${targetBlocks}
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )
  end
end
`;

  await fs.writeFile(podfilePath, podfileContent, "utf8");
}

module.exports = { updatePodfileForEnvs };
