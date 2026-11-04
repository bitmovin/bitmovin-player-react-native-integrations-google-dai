require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
podfile_properties = JSON.parse(File.read("#{Pod::Config.instance.installation_root}/Podfile.properties.json")) rescue {}

Pod::Spec.new do |s|
  s.name           = 'RNBitmovinPlayerGoogleDai'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.10'
  s.source         = {
    git: 'https://github.com/bitmovin/bitmovin-player-react-native-integrations-google-dai',
    tag: "v#{s.version}"
  }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'RNBitmovinPlayer', '>= 1.27.1'

  unless respond_to?(:spm_dependency, true)
    raise 'RNBitmovinPlayerGoogleDai requires React Native with spm_dependency support (>= 0.75).'
  end

  core_package_path = Pod::Executable.execute_command(
    'node',
    ['--print', 'require.resolve("bitmovin-player-react-native/package.json", { paths: [process.argv[1]] })', __dir__]
  ).strip
  core_version = Gem::Version.new(JSON.parse(File.read(core_package_path)).fetch('version'))
  # Core versions before 1.30 always include IMA and do not write this property.
  ima_opt_in_required = core_version >= Gem::Version.new('1.30.0') || podfile_properties.key?('BITMOVIN_ENABLE_GOOGLE_IMA')
  if ima_opt_in_required && podfile_properties['BITMOVIN_ENABLE_GOOGLE_IMA'].to_s.strip.downcase != 'true'
    raise 'Google DAI requires Google IMA. Set features.googleIMA to true in the Bitmovin Expo plugin, or BITMOVIN_ENABLE_GOOGLE_IMA to true in Podfile.properties.json, and reinstall pods.'
  end

  dependency = JSON.parse(File.read(File.join(__dir__, 'dependencies.json'))).fetch('BitmovinGoogleDAIPlayer')
  spm_dependency(
    s,
    url: dependency.fetch('url'),
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: dependency.fetch('version') },
    products: [dependency.fetch('product')]
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  # Match RNBitmovinPlayer's archive fix for duplicate SPM framework signatures.
  s.script_phase = {
    :name => 'Remove duplicate SPM archive signatures',
    :execution_position => :after_compile,
    :script => <<-'SH'
set -eu
if [ "${ACTION:-}" != "install" ]; then
  exit 0
fi
pod_dir=$(cd "${CONFIGURATION_BUILD_DIR:?}" && pwd -P)
shared_dir=$(cd "${PODS_CONFIGURATION_BUILD_DIR:?}" && pwd -P)
if [ "$pod_dir" = "$shared_dir" ]; then
  exit 0
fi
for signature in "$pod_dir"/*.xcframework-*.signature; do
  [ -f "$signature" ] || continue
  shared_signature="$shared_dir/$(basename "$signature")"
  # Never remove a unique signature or silently hide a signature mismatch.
  if [ -f "$shared_signature" ] && cmp -s "$signature" "$shared_signature"; then
    rm -f "$signature"
  fi
done
SH
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
