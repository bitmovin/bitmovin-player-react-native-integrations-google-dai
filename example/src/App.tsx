import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  const [status, setStatus] = useState('Mounting player view...');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

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
    setStatus('PlayerView mounted. Tap “Load Google DAI”.');
    return () => player.destroy();
  }, [player]);

  const loadGoogleDai = useCallback(async () => {
    if (playerViewRef.current == null) {
      setStatus('PlayerView is not ready yet. Try again in a moment.');
      return;
    }

    setIsLoading(true);
    setStatus('Loading Google DAI live stream...');
    try {
      await player.googleDai.load(liveDaiConfig);
      player.play();
      setIsLoaded(true);
      setStatus('Google DAI stream loaded. Watch Metro logs for ad events.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Google DAI load failed: ${message}`);
      console.warn('[Google DAI Example] load failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [player]);

  return (
    <SafeAreaView style={styles.safeArea}>
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
        <View style={styles.panel}>
          <Text style={styles.title}>Google IMA DAI</Text>
          <Text style={styles.description}>{status}</Text>
          <Pressable
            disabled={isLoading || isLoaded}
            onPress={() => {
              void loadGoogleDai();
            }}
            style={({ pressed }) => [
              styles.button,
              (pressed || isLoading || isLoaded) && styles.buttonDisabled,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {isLoaded ? 'DAI loaded' : 'Load Google DAI'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0E11',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0E11',
  },
  player: {
    flex: 1,
  },
  panel: {
    gap: 12,
    padding: 16,
    backgroundColor: 'white',
  },
  title: {
    color: '#0B0E11',
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: '#263238',
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#1EABE3',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
