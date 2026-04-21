import { StatusBar } from 'expo-status-bar';
import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingTabBar, type MainTab } from './components/FloatingTabBar';
import { Scene3D } from './components/Scene3D';

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MainTab>('journey');
  const [steps, setSteps] = useState(0);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let sub: { remove(): void } | undefined;

    (async () => {
      const isAvailable = await Pedometer.isAvailableAsync();
      setAvailable(isAvailable);
      if (!isAvailable) return;

      const { status } = await Pedometer.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');

      sub = Pedometer.watchStepCount((result) => {
        // Cumulative steps since this watch session started (not per-callback deltas).
        setSteps(result.steps);
      });
    })();

    return () => sub?.remove();
  }, []);

  return (
    <View style={styles.screen}>
      {activeTab === 'journey' && (
        <>
          <View style={styles.canvas}>
            <Scene3D steps={steps} />
          </View>

          <View style={styles.header} pointerEvents="none">
            <Text style={styles.title}>Odyssey</Text>
            <Text style={styles.subtitle}>
              {available === false && 'Pedometer not available on this device.'}
              {available !== false && permission === 'denied' && 'Motion permission is required to count steps.'}
              {available !== false && permission === 'granted' && 'Steps today (session)'}
              {available !== false && permission === 'unknown' && 'Setting up…'}
            </Text>
            <Text style={styles.steps}>{steps}</Text>
          </View>
        </>
      )}

      {activeTab === 'collections' && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Collections</Text>
          <Text style={styles.placeholderBody}>Your finds and mementos will live here.</Text>
        </View>
      )}

      {activeTab === 'settings' && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Settings</Text>
          <Text style={styles.placeholderBody}>Tune your walk, audio, and reminders here.</Text>
        </View>
      )}

      <FloatingTabBar active={activeTab} onChange={setActiveTab} bottomInset={insets.bottom} />

      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  /** Canvas is edge-to-edge behind the UI so we see more sky above the path. */
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f4f4f8',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#f0f3ff',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  steps: {
    marginTop: 12,
    fontSize: 44,
    fontWeight: '600',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.32)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
    backgroundColor: '#0b1020',
  },
  placeholderTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f4f4f8',
    marginBottom: 10,
  },
  placeholderBody: {
    fontSize: 16,
    color: 'rgba(240,243,255,0.72)',
    textAlign: 'center',
    lineHeight: 22,
  },
});
