# Bitmovin Player React Native Google DAI

Optional companion package for Google IMA Dynamic Ad Insertion (DAI/SSAI) support in `bitmovin-player-react-native`.

## Installation

```sh
yarn add bitmovin-player-react-native @bitmovin/player-react-native-google-dai
```

The package is an Expo module; Expo autolinking handles native installation.

### iOS native dependency

The native Google DAI integration is distributed as a tagged CocoaPod outside of CocoaPods Trunk. Expo autolinking discovers this React Native module, but it cannot determine the Git source of that native dependency. Therefore, iOS applications must declare `BitmovinGoogleDAIPlayer` as an extra pod through [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/).

Install the config plugin:

```sh
yarn expo install expo-build-properties
```

Then add the extra pod to the `plugins` section of `app.config.ts`:

```ts
const config = {
  // ...
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          extraPods: [
            {
              name: 'BitmovinGoogleDAIPlayer',
              git: 'https://github.com/bitmovin/bitmovin-player-ios-integrations-google-dai.git',
              tag: '0.2.0',
            },
          ],
        },
      },
    ],
  ],
};
```

If the application already uses `expo-build-properties`, merge this entry into its existing `ios.extraPods` array. Then regenerate the native iOS project:

```sh
yarn expo prebuild --platform ios
```

Do not add the pod directly to the generated `ios/Podfile`; Expo prebuild can recreate that file.

## Compatibility

| Component                    | Requirement |
| ---------------------------- | ----------- |
| Bitmovin Player React Native | `>=1.22.0`  |
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

## Contributing and license

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). This project is available under the [MIT License](LICENSE).
