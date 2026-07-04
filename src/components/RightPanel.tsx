import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { theme } from '@/theme';
import { useKaleidoscope, type DriveMode } from '@/state/store';
import type { Drive } from '@/hooks/useDrive';
import { RotaryKnob } from './RotaryKnob';

const MODES: { id: DriveMode; label: string; en: string; icon: string }[] = [
  { id: 'knob', label: '旋钮', en: 'Knob', icon: '⟳' },
  { id: 'tilt', label: '转动', en: 'Tilt', icon: '⤿' },
  { id: 'shake', label: '晃动', en: 'Shake', icon: '⇄' },
];

const HINT: Record<DriveMode, string> = {
  knob: '拨动旋钮转动碎片\n停下即定格\nFlick to turn · freezes when still',
  tilt: '转动手机驱动旋转\n静止即定格\nRotate your phone',
  shake: '晃动手机翻滚碎片\n静止即定格\nShake to tumble',
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

      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                setMode(m.id);
                Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.modeBtn, active && styles.modeActive]}
            >
              <Text style={[styles.modeIcon, active && styles.modeTextActive]}>
                {m.icon}
              </Text>
              <Text style={[styles.modeLabel, active && styles.modeTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.knobWrap}>
        <RotaryKnob size={knobSize} drive={drive} enabled={mode === 'knob'} />
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
  modeRow: {
    flexDirection: 'row',
    gap: theme.space(2),
    width: '100%',
    justifyContent: 'center',
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
  },
  modeActive: {
    backgroundColor: theme.colors.active,
    borderColor: theme.colors.accentGlow,
  },
  modeIcon: { color: theme.colors.textDim, fontSize: 20 },
  modeLabel: { color: theme.colors.textDim, fontSize: theme.font.tiny },
  modeTextActive: { color: theme.colors.text, fontWeight: '600' },
  knobWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  hint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.tiny,
    textAlign: 'center',
    lineHeight: 16,
  },
});
