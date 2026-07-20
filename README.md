# Bitmovin Player React Native Google DAI

Optional companion package for Google IMA Dynamic Ad Insertion (DAI/SSAI) support in `bitmovin-player-react-native`.

> Release note: this package is staged for Android-first validation. Do not publish it publicly until the rollout checklist is complete, including the confirmed iOS native DAI SDK contract.

## Installation

```sh
yarn add bitmovin-player-react-native @bitmovin/player-react-native-google-dai
```

The companion package is an Expo module and does not require a companion Expo config plugin for the MVP. Installing the package is enough for Expo autolinking.

## Compatibility

- Peer package: `bitmovin-player-react-native@^1.21.0`
- Expo crypto peer: `expo-crypto@>=14.0.0` (used for generated internal Google DAI adapter IDs)
- Android native DAI artifact: `com.bitmovin.player.integration:google-dai:0.1.0-alpha.1`
- Android Bitmovin Player artifacts: transitive runtime pins for `com.bitmovin.player:player` and `com.bitmovin.player:player-media-session` at `3.159.0+jason` to satisfy the alpha DAI adapter.
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
import { useEffect, useMemo } from 'react';
import { Button } from 'react-native';
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

  return (
    <>
      <PlayerView
        player={player}
        onPlayerError={(event) => console.warn(event)}
        onAdStarted={(event) => console.warn('ad started', event)}
      />
      <Button
        title="Load DAI"
        onPress={() => {
          void player.googleDai.load({
            kind: 'live',
            assetKey: '...',
            type: GoogleDaiSourceType.HLS,
            apiKey: '...',
            networkCode: '...',
            adTagParameters: {
              cust_params: '...',
            },
          });
        }}
      />
    </>
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

`withGoogleDai(player)` preserves the original player object identity, attaches a read-only non-enumerable `googleDai` property to that player instance, and returns `Player & GoogleDaiCapability`. It does not modify `Player.prototype`. Repeated calls with the same player return the same `GoogleDai` instance. `player.googleDai.load()` lazily creates the native DAI adapter for an already initialized player before loading the source config. It does not initialize the core `Player`.

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

## iOS status

The iOS Expo module is intentionally a minimal placeholder so Apple builds can autolink this companion without pulling in unconfirmed native DAI dependencies. `initialize()` and `load()` reject with `IOS_GOOGLE_DAI_NOT_IMPLEMENTED`; `destroy()` is a no-op. The following iOS SDK-owner confirmations are still required before public release:

- pod name and module import;
- supported platforms;
- native DAI adapter class and constructor;
- source config type and source type enum;
- load/destroy semantics;
- regular ad/SSAI event forwarding behavior.

## Validation and release checklist

Run the companion TypeScript checks from the repository root:

```sh
yarn build:google-dai
yarn lint:google-dai
yarn typecheck:google-dai
```

Native/package validation is manual for now:

- Android: build and run the example app on a device/emulator and confirm playback/ad events.
- iOS: confirm the placeholder autolinks and builds without Bitmovin Player or Google DAI native pods.

The companion package has a guarded `prepublishOnly` script and is blocked from publishing by default. Set `BITMOVIN_GOOGLE_DAI_ALLOW_PUBLISH=1` only after the remaining checks below are complete.

Before publishing this companion package:

- [ ] companion Android native lint/build checks pass;
- [ ] companion iOS placeholder lint/build checks pass without Bitmovin Player or Google DAI native pods;
- [ ] a core-only fixture builds without autolinking `GoogleDaiModule`;
- [ ] the core-only fixture has no Android `google-dai` artifact in its dependency tree;
- [ ] duplicate, invalid-config, and destroyed-player error cases are covered;
- [ ] release, package-maintenance, CI-fixture, and native-dependency-pin owners are assigned.
