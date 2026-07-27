# Bitmovin Player React Native Google DAI

Optional companion package for Google IMA Dynamic Ad Insertion (DAI/SSAI) support in `bitmovin-player-react-native`.

> Release note: this package is staged for Android-first support. iOS currently uses a placeholder module until the native DAI SDK contract is confirmed.


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

- Peer package: `bitmovin-player-react-native@^1.22.0`
- Expo crypto peer: `expo-crypto@>=14.0.0` (used for generated Google DAI native IDs)
- Android native DAI artifact: `com.bitmovin.player.integration:google-dai:0.1.0-alpha.1`
- Minimum Android Bitmovin Player SDK version: `3.159.0+jason`.
- iOS: placeholder Expo module only; no Bitmovin Player or Google DAI native pods are linked until the iOS DAI SDK contract is confirmed.
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
        adTagParameters: {
          cust_params: '...',
        },
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

`withGoogleDai(player)` preserves the original player object identity, attaches a read-only non-enumerable `googleDai` property to that player instance, and returns `Player & GoogleDaiCapability`. It does not modify `Player.prototype`. Repeated calls with the same player return the same `GoogleDai` instance. `player.googleDai.load()` lazily creates the native DAI adapter before loading the source config. It does not initialize the core `Player`; mount `PlayerView` and call `load()` from `PlayerView.onPlayerViewReady` so the native view and ad UI container are attached.

### Source config

```ts
export enum GoogleDaiSourceType {
  DASH = 'dash',
  HLS = 'hls',
}

export interface GoogleDaiLiveSourceConfig {
  kind: 'live';
  assetKey: string;
  type: GoogleDaiSourceType;
  apiKey?: string;
  networkCode?: string;
  adTagParameters?: Record<string, string>;
}
```

The MVP supports live DAI streams only. VOD support is intentionally rejected until the native source-config contract is added.

## iOS status

The iOS Expo module is intentionally a minimal placeholder so Apple builds can autolink this companion without pulling in unconfirmed native DAI dependencies. `initialize()` and `load()` reject with `IOS_GOOGLE_DAI_NOT_IMPLEMENTED`; `destroy()` is a no-op. The following iOS SDK-owner confirmations are still required before public release:

- pod name and module import;
- supported platforms;
- native DAI adapter class and constructor;
- source config type and source type enum;
- load/destroy semantics;
- regular ad/SSAI event forwarding behavior.
