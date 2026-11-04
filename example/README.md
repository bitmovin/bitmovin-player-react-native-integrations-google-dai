# Google DAI example app

Small Expo dev-client app for validating `@bitmovin/player-react-native-google-dai` with `bitmovin-player-react-native`.

The example uses Expo SDK 58 and React Native 0.88.1 for Xcode 27 support. It requires iOS 16.4 or newer. The published integration's minimum versions remain unchanged.

## Setup

```sh
cd example
yarn install
cp .env.example .env
# edit .env and set BITMOVIN_PLAYER_LICENSE_KEY
```

## Run

```sh
yarn prebuild
yarn android
# or
yarn ios
```

After upgrading from an older checkout, regenerate the native project with `yarn prebuild --platform ios` and rebuild the development client. Expo 58 generates the scene lifecycle required by iOS 27.

Android builds with Expo 58 are currently blocked because the integration and core player reference the removed `ExpoModulesCorePlugin.gradle` script.

The sample uses Google's public live DAI HLS test stream:

- asset key: `c-rArva4ShKVIAkNfy6HUQ`
- network code: `21775744923`

Playback starts automatically from `PlayerView.onPlayerViewReady`. Player and ad events are logged to Metro.
