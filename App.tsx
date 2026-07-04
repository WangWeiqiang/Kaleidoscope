import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { theme } from '@/theme';
import { useDrive } from '@/hooks/useDrive';
import { useKaleidoscope } from '@/state/store';
import { KaleidoscopeCanvas } from '@/components/KaleidoscopeCanvas';
import { LeftPanel } from '@/components/LeftPanel';
import { RightPanel } from '@/components/RightPanel';
import { FragmentPicker } from '@/components/FragmentPicker';

const PANEL_WIDTH = 176; // compact control panels
const PANEL_GAP = 8;
const VIEWER_MARGIN = 10; // breathing space between a panel and the viewer

function Stage() {
  const insets = useSafeAreaInsets();
  const mode = useKaleidoscope((s) => s.mode);
  const drive = useDrive(mode);

  const [layout, setLayout] = useState({ width: 0, height: 0 });

  // Immersive toggle: tapping the centre slides the panels off to the sides.
  const open = useSharedValue(1); // 1 = panels visible, 0 = hidden
  const [visible, setVisible] = useState(true);

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    open.value = withTiming(next ? 1 : 0, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
    });
    Haptics.selectionAsync().catch(() => {});
  };

  // Horizontal space each panel occupies (including the safe-area inset).
  const clearLeft = insets.left + PANEL_GAP + PANEL_WIDTH;
  const clearRight = insets.right + PANEL_GAP + PANEL_WIDTH;

  // The square viewer is sized to fit the clear gap BETWEEN the panels (with a
  // breathing margin) so it is never covered by them, and clamped to the height.
  const padded = layout.height - insets.top - insets.bottom - theme.space(4);
  const clearWidth = layout.width - clearLeft - clearRight - 2 * VIEWER_MARGIN;
  const viewer = Math.max(0, Math.min(padded, clearWidth));
  const knobSize = Math.min(138, Math.max(92, viewer * 0.4));

  const leftOffset = PANEL_WIDTH + insets.left + PANEL_GAP + 16;
  const rightOffset = PANEL_WIDTH + insets.right + PANEL_GAP + 16;

  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - open.value) * leftOffset }],
    opacity: open.value,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - open.value) * rightOffset }],
    opacity: open.value,
  }));
  // Edge handles (tap-to-reveal hints) fade in as the panels hide.
  const hintStyle = useAnimatedStyle(() => ({ opacity: 1 - open.value }));

  return (
    <View
      style={styles.stage}
      onLayout={(e) =>
        setLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {/* CENTER — full-bleed tap layer (toggles panels) with the viewer centred
          in the clear gap between the panels so they never cover it. */}
      <Pressable
        style={[
          styles.center,
          { paddingLeft: clearLeft + VIEWER_MARGIN, paddingRight: clearRight + VIEWER_MARGIN },
        ]}
        onPress={toggle}
      >
        {viewer > 0 ? (
          <KaleidoscopeCanvas size={viewer} drive={drive} />
        ) : null}
      </Pressable>

      {/* Tap-to-reveal handles, visible only while the panels are hidden */}
      <Animated.View
        pointerEvents="none"
        style={[styles.handle, styles.handleLeft, hintStyle]}
      >
        <Text style={styles.handleText}>›</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.handle, styles.handleRight, hintStyle]}
      >
        <Text style={styles.handleText}>‹</Text>
      </Animated.View>

      {/* LEFT — mirror count + add-fragments */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            left: insets.left + PANEL_GAP,
            top: insets.top + PANEL_GAP,
            bottom: insets.bottom + PANEL_GAP,
          },
          leftStyle,
        ]}
      >
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>Kaleidoscope</Text>
          <Text style={styles.brandSub}>万花筒</Text>
        </View>
        <LeftPanel />
      </Animated.View>

      {/* RIGHT — rotary knob + motion mode */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            right: insets.right + PANEL_GAP,
            top: insets.top + PANEL_GAP,
            bottom: insets.bottom + PANEL_GAP,
          },
          rightStyle,
        ]}
      >
        <RightPanel drive={drive} knobSize={knobSize} />
      </Animated.View>

      {/* Fragment picker popup */}
      <FragmentPicker />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar hidden style="light" />
        <Stage />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  stage: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    position: 'absolute',
    width: PANEL_WIDTH,
    backgroundColor: theme.colors.panel,
    borderColor: theme.colors.panelBorder,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    width: 26,
    height: 52,
    borderRadius: 13,
    backgroundColor: theme.colors.panel,
    borderColor: theme.colors.panelBorder,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleLeft: { left: 6 },
  handleRight: { right: 6 },
  handleText: {
    color: theme.colors.accent,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  brand: {
    paddingHorizontal: theme.space(3),
    paddingTop: theme.space(3),
  },
  brandTitle: {
    color: theme.colors.text,
    fontSize: theme.font.title,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandSub: {
    color: theme.colors.accent,
    fontSize: theme.font.small,
    letterSpacing: 6,
    marginTop: 2,
  },
});
