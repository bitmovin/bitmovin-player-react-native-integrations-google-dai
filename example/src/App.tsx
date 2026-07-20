import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Player, PlayerView, type Event } from 'bitmovin-player-react-native';
import {
  GoogleDaiSourceType,
  withGoogleDai,
} from '@bitmovin/player-react-native-google-dai';

const liveDaiConfig = {
  kind: 'live' as const,
  assetKey: 'c-rArva4ShKVIAkNfy6HUQ',
  networkCode: '21775744923',
  type: GoogleDaiSourceType.HLS,
};

function logEvent(event: Event) {
  console.log(`[Google DAI Example] ${event.name}`, JSON.stringify(event));
}

export default function App() {
  const playerViewRef = useRef(null);
  const didStartLoadRef = useRef(false);

  const player = useMemo(
    () =>
      withGoogleDai(
        new Player({
          playbackConfig: {
            isAutoplayEnabled: true,
          },
          remoteControlConfig: {
            isCastEnabled: false,
          },
        })
      ),
    []
  );

  useEffect(() => {
    let retryHandle: ReturnType<typeof setTimeout> | undefined;

    const startGoogleDai = () => {
      if (didStartLoadRef.current) {
        return;
      }
      if (playerViewRef.current == null) {
        retryHandle = setTimeout(startGoogleDai, 100);
        return;
      }
      didStartLoadRef.current = true;
      void player.googleDai
        .load(liveDaiConfig)
        .then(() => player.play())
        .catch((error) => {
          console.warn('[Google DAI Example] load failed', error);
        });
    };

    startGoogleDai();

    return () => {
      if (retryHandle) {
        clearTimeout(retryHandle);
      }
      player.destroy();
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <PlayerView
        player={player}
        viewRef={playerViewRef}
        style={styles.player}
        onAdBreakFinished={logEvent}
        onAdBreakStarted={logEvent}
        onAdError={logEvent}
        onAdFinished={logEvent}
        onAdStarted={logEvent}
        onPlayerError={logEvent}
        onPlaying={logEvent}
        onReady={logEvent}
        onSourceLoaded={logEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E11',
  },
  player: {
    flex: 1,
  },
});
