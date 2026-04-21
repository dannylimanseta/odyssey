import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export type MainTab = 'journey' | 'collections' | 'settings';

type IonName = ComponentProps<typeof Ionicons>['name'];

type TabDef = {
  id: MainTab;
  label: string;
  icon: IonName;
  iconActive: IonName;
};

const TABS: TabDef[] = [
  { id: 'journey', label: 'Journey', icon: 'compass-outline', iconActive: 'compass' },
  { id: 'collections', label: 'Collections', icon: 'albums-outline', iconActive: 'albums' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

type Props = {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  bottomInset?: number;
};

export function FloatingTabBar({ active, onChange, bottomInset = 0 }: Props) {
  /** Tight to home indicator — “lower” on screen than the previous 16px lift. */
  const bottom = 6 + bottomInset;

  return (
    <View style={[styles.screenAttach, { bottom }]} pointerEvents="box-none">
      <View style={styles.shadowWrap}>
        <View style={styles.pillClip}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 38 : 48}
            tint="dark"
            style={styles.blurFill}
          >
            <View style={styles.blurInner}>
              <View style={styles.fallbackTint} pointerEvents="none" />
              <View style={styles.row}>
              {TABS.map((tab) => {
                const isOn = active === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOn }}
                    accessibilityLabel={tab.label}
                    onPress={() => onChange(tab.id)}
                    style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
                  >
                    <Ionicons
                      name={isOn ? tab.iconActive : tab.icon}
                      size={22}
                      color={isOn ? '#ffffff' : 'rgba(255,255,255,0.52)'}
                    />
                    <Text style={[styles.tabLabel, isOn && styles.tabLabelActive]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
              </View>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenAttach: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  shadowWrap: {
    maxWidth: 400,
    width: '100%',
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  pillClip: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  blurFill: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  blurInner: {
    position: 'relative',
  },
  /** Subtle veil so legibility holds on platforms where blur is lighter. */
  fallbackTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 34, 56, 0.22)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 999,
    gap: 4,
  },
  tabPressed: {
    opacity: 0.88,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#ffffff',
  },
});
