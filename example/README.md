# Google DAI example app

Small Expo dev-client app for validating `@bitmovin/player-react-native-google-dai` with `bitmovin-player-react-native`.

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
# or, once the iOS DAI implementation exists:
yarn ios
```

The sample uses Google's public live DAI HLS test stream:

- asset key: `c-rArva4ShKVIAkNfy6HUQ`
- network code: `21775744923`

Playback starts automatically after the `PlayerView` appears. Player and ad events are logged to Metro.

> iOS currently uses a minimal placeholder module. `initialize()` and `load()` reject with `IOS_GOOGLE_DAI_NOT_IMPLEMENTED`, and no native iOS DAI/player pods are linked until the iOS DAI SDK contract is confirmed.
