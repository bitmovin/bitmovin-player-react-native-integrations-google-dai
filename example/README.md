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
# or
yarn ios
```

The sample uses Google's public live DAI HLS test stream:

- asset key: `c-rArva4ShKVIAkNfy6HUQ`
- network code: `21775744923`

Playback starts automatically from `PlayerView.onPlayerViewReady`. Player and ad events are logged to Metro.
