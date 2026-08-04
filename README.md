# Bitmovin Player React Native Google DAI

Optional companion package for Google IMA Dynamic Ad Insertion (DAI/SSAI) support in `bitmovin-player-react-native`.

## Contributions to this project

As an open-source project, we welcome changes, updates, and fixes from the community. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is available under the [MIT License](LICENSE).

## Installation

```sh
yarn add bitmovin-player-react-native @bitmovin/player-react-native-google-dai
```

The companion package is an Expo module and does not require a companion Expo config plugin for the MVP. Installing the package is enough for Expo autolinking.

## Compatibility

- Peer package: `bitmovin-player-react-native@>=1.22.0`
- Expo crypto peer: `expo-crypto@>=14.0.0` (used for generated Google DAI native IDs)
- Android native DAI artifact: `com.bitmovin.player.integration:google-dai:0.1.0`
- Minimum Android Bitmovin Player SDK version: `3.159.0+jason`.
- iOS native DAI package: `bitmovin-player-ios-integrations-google-dai@0.1.0` via React Native Swift Package Manager support.
- iOS: live HLS streams only. DASH is Android-only; ad tag parameters are not supported by the native iOS integration yet.
- Android repository:

```kotlin
repositories {
    maven {
        url = uri("https://artifacts.bitmovin.com/artifactory/public-releases")
    }
}
```

Native DAI artifacts are pinned by this package and are intentionally not consumer-overridable in the MVP.

## Usage

```tsx
import { useCallback, useEffect, useMemo } from 'react';
import { Player, PlayerView } from 'bitmovin-player-react-native';
import {
  GoogleDaiSourceType,
  withGoogleDai,
} from '@bitmovin/player-react-native-google-dai';

export function GoogleDaiPlayer() {
  const player = useMemo(
    () =>
      withGoogleDai(
        new Player({
          playbackConfig: {
            isAutoplayEnabled: true,
          },
        })
      ),
    []
  );

  useEffect(() => {
    return () => player.destroy();
  }, [player]);

  const loadGoogleDai = useCallback(() => {
    void player.googleDai
      .load({
        kind: 'live',
        assetKey: '...',
        type: GoogleDaiSourceType.HLS,
        apiKey: '...',
        networkCode: '...',
      })
      .then(() => player.play())
      .catch((error) => console.warn('Google DAI load failed', error));
  }, [player]);

  return (
    <PlayerView
      player={player}
      onPlayerViewReady={loadGoogleDai}
      onPlayerError={(event) => console.warn(event)}
      onAdStarted={(event) => console.warn('ad started', event)}
    />
  );
}
```

## API

```ts
const player = withGoogleDai(new Player(config));
await player.googleDai.load(liveDaiConfig);
player.play();
player.destroy();
```

`withGoogleDai(player)` preserves the original player object identity, attaches a read-only non-enumerable `googleDai` property to that player instance, and returns `Player & GoogleDaiCapability`. It does not modify `Player.prototype`. Repeated calls with the same player return the same `GoogleDaiApi` instance. `player.googleDai.load()` lazily creates the native DAI adapter before loading the source config. It does not initialize the core `Player`; mount `PlayerView` and call `load()` from `PlayerView.onPlayerViewReady` so the native view and ad UI container are attached.

### Source config

```ts
export enum GoogleDaiSourceType {
  /**
   * @platform Android
   */
  DASH = 'dash',
  HLS = 'hls',
}

export interface GoogleDaiLiveSourceConfig {
  kind: 'live';
  assetKey: string;
  type: GoogleDaiSourceType;
  apiKey?: string;
  networkCode?: string;
  /**
   * @platform Android
   */
  adTagParameters?: Record<string, string>;
}
```

The MVP supports live DAI streams only. VOD support is intentionally rejected until the native source-config contract is added. DASH sources are Android-only. `adTagParameters` are Android-only until the native iOS integration adds support.

> Note: Seeking or time-shifting back into an already-played Google DAI ad segment does not replay IMA ad lifecycle events. The media may play again, but ad events are emitted only according to Google IMA DAI tracking state.

## Example app

This repository includes a minimal Expo dev-client sample under [`example/`](example/) that installs this package via `file:..`, configures the core `bitmovin-player-react-native` plugin with `BITMOVIN_PLAYER_LICENSE_KEY`, and loads Google's public live DAI HLS test stream.

```sh
cd example
yarn install
cp .env.example .env
# edit .env and set BITMOVIN_PLAYER_LICENSE_KEY
yarn prebuild
yarn android
```
