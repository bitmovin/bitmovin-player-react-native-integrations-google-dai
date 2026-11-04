# Bitmovin Player React Native Google DAI

Optional companion package for Google IMA Dynamic Ad Insertion (DAI/SSAI) support in `bitmovin-player-react-native`.

## Installation

```sh
yarn add bitmovin-player-react-native @bitmovin/player-react-native-google-dai
```

The package is an Expo module; Expo autolinking handles native installation.

Add the `bitmovin-player-react-native` config plugin to your app configuration, or merge these options into its existing entry:

> **Player React Native `1.30.0` and newer:** Set `features.googleIMA: true`. Google DAI requires IMA, which is disabled by default in these versions. Earlier core versions include IMA by default.

```ts
const config = {
  // ...
  plugins: [
    [
      'bitmovin-player-react-native',
      {
        playerLicenseKey: 'YOUR_BITMOVIN_PLAYER_LICENSE_KEY',
        features: {
          googleIMA: true,
        },
      },
    ],
  ],
};
```

### iOS native dependency

Native Google DAI is installed through Swift Package Manager (SPM), sharing the Player and IMA dependencies with the core React Native wrapper. CocoaPods still installs the React Native bridges and Expo modules.

The core config plugin links the Player and IMA frameworks to the app target. For apps maintained without Expo prebuild, follow the core wrapper's [iOS dependency guide](https://github.com/bitmovin/bitmovin-player-react-native/blob/development/docs/ios-dependencies.md) to configure these dependencies.

## Compatibility

| Component                    | Requirement |
| ---------------------------- | ----------- |
| Bitmovin Player React Native | `>=1.27.1`  |
| Expo                         | `>=54.0.0`  |
| React Native                 | `>=0.75.0`  |

Android consumers must include the Bitmovin public releases repository:

```kotlin
repositories {
    maven {
        url = uri("https://artifacts.bitmovin.com/artifactory/public-releases")
    }
}
```

Android release builds require core library desugaring for the Google IMA dependency. Expo apps using the `bitmovin-player-react-native` config plugin get this automatically; manual/native setups or Kotlin DSL Gradle files must configure it in the app module (`android/app/build.gradle(.kts)`):

```kotlin
android {
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
```

Compatible native Google DAI integrations and Android Player SDK versions are pinned by each package release and should not be overridden.

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

`withGoogleDai(player)` preserves the player identity and returns `Player & GoogleDaiCapability`. The native DAI adapter is initialized lazily by `player.googleDai.load()`. Call `load()` after `PlayerView.onPlayerViewReady`; it does not initialize the core player.

## Source config

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
  adTagParameters?: Record<string, string>;
}
```

Only live DAI streams are supported; VOD configurations are rejected. iOS supports HLS only; DASH is Android-only.

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
# or
yarn ios
```

## Migrating to 0.4.0 - iOS only

Version `0.4.0` of this integration moves native Google DAI to Swift Package Manager (SPM) to share Player and IMA dependencies with the core React Native wrapper. It requires Player React Native `1.27.1` or newer, which includes the archive signature fix.

To migrate an existing CocoaPods-based DAI integration:

1. Update this integration to `0.4.0` and ensure Player React Native is `1.27.1` or newer.
1. Remove `BitmovinGoogleDAIPlayer` from `ios.extraPods` in `expo-build-properties`, or from your Podfile if it was declared there directly.
1. Configure the core plugin as shown under [Installation](#installation). With Player React Native `1.30.0` or newer, enable `features.googleIMA`.
1. Regenerate the native iOS project and install pods:

```sh
yarn expo prebuild --platform ios --no-install
(cd ios && pod install)
```

Then rebuild the app using your usual Expo or React Native workflow.

## Contributing and license

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). This project is available under the [MIT License](LICENSE).
