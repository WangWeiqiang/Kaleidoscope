import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { theme } from '@/theme';
import { useKaleidoscope, type DriveMode } from '@/state/store';
import type { Drive } from '@/hooks/useDrive';
import { RotaryKnob } from './RotaryKnob';
import { MotionIllustration } from './MotionIllustration';

const MODES: { id: DriveMode; label: string }[] = [
  { id: 'knob', label: '旋钮' },
  { id: 'tilt', label: '转动' },
  { id: 'shake', label: '晃动' },
];

const HINT: Record<DriveMode, string> = {
  knob: '拨动旋钮转动碎片\n停下即定格',
  tilt: '沿屏幕平面转动手机\n静止即定格',
  shake: '晃动手机翻滚碎片\n静止即定格',
};

interface Props {
  drive: Drive;
  knobSize: number;
}

export function RightPanel({ drive, knobSize }: Props) {
  const mode = useKaleidoscope((s) => s.mode);
  const setMode = useKaleidoscope((s) => s.setMode);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>驱动 · Motion</Text>

      {/* segmented mode tabs */}
      <View style={styles.tabs}>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                setMode(m.id);
                Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.stage}>
        {mode === 'knob' ? (
          <RotaryKnob size={knobSize} drive={drive} enabled />
        ) : (
          <MotionIllustration kind={mode} size={knobSize} />
        )}
      </View>

      <Text style={styles.hint}>{HINT[mode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.space(3),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.textFaint,
    fontSize: theme.font.small,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    padding: 3,
    borderRadius: theme.radius.sm + 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.sm,
  },
  tabActive: {
    backgroundColor: theme.colors.active,
    borderWidth: 1,
    borderColor: theme.colors.accentGlow,
  },
  tabLabel: { color: theme.colors.textDim, fontSize: theme.font.label },
  tabLabelActive: { color: theme.colors.text, fontWeight: '600' },
  stage: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  hint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.tiny,
    textAlign: 'center',
    lineHeight: 16,
  },
});
