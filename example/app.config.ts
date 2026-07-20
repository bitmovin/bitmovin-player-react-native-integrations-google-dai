import type { ExpoConfig } from '@expo/config-types';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const bitmovinPlayerLicenseKey = process.env.BITMOVIN_PLAYER_LICENSE_KEY;

if (!bitmovinPlayerLicenseKey) {
  throw new Error(
    'BITMOVIN_PLAYER_LICENSE_KEY is not set. Copy example/.env.example to example/.env and add your license key.'
  );
}

const config: ExpoConfig = {
  name: 'Bitmovin Google DAI Example',
  slug: 'bitmovin-google-dai-example',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.bitmovin.player.reactnative.googledai.example',
  },
  android: {
    package: 'com.bitmovin.player.reactnative.googledai.example',
  },
  plugins: [
    'expo-dev-client',
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 35,
        },
        ios: {
          deploymentTarget: '15.1',
        },
      },
    ],
    [
      'bitmovin-player-react-native',
      {
        playerLicenseKey: bitmovinPlayerLicenseKey,
      },
    ],
  ],
};

export default config;
