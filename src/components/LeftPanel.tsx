import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { theme } from '@/theme';
import { useKaleidoscope } from '@/state/store';
import { MIRROR_OPTIONS } from '@/shaders/kaleidoscope';
import { PolygonGlyph } from './PolygonGlyph';

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function LeftPanel() {
  const mirrors = useKaleidoscope((s) => s.mirrors);
  const setMirrors = useKaleidoscope((s) => s.setMirrors);
  const chamber = useKaleidoscope((s) => s.chamber);
  const setChamber = useKaleidoscope((s) => s.setChamber);
  const fragments = useKaleidoscope((s) => s.fragments);
  const openPicker = useKaleidoscope((s) => s.openPicker);
  const clearFragments = useKaleidoscope((s) => s.clearFragments);

  const tap = () => Haptics.selectionAsync().catch(() => {});

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SectionTitle>镜面 · Mirrors</SectionTitle>
      <View style={styles.mirrorGrid}>
        {MIRROR_OPTIONS.map((opt) => {
          const active = opt.sides === mirrors;
          return (
            <Pressable
              key={opt.sides}
              onPress={() => {
                setMirrors(opt.sides);
                tap();
              }}
              style={[styles.mirrorCell, active && styles.cellActive]}
            >
              <PolygonGlyph
                sides={opt.sides}
                size={32}
                color={active ? theme.colors.accent : theme.colors.textDim}
                fill={active ? theme.colors.active : undefined}
                strokeWidth={2}
              />
              <Text style={[styles.mirrorLabel, active && styles.labelActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>物件仓 · Cell</SectionTitle>
      <View style={styles.chamberRow}>
        {(
          [
            { id: 'dry', label: '干式', sub: '翻滚崩落' },
            { id: 'oil', label: '油室', sub: '缓慢漂移' },
          ] as const
        ).map((opt) => {
          const active = chamber === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                setChamber(opt.id);
                tap();
              }}
              style={[styles.chamberCell, active && styles.cellActive]}
            >
              <Text style={[styles.mirrorLabel, active && styles.labelActive]}>
                {opt.label}
              </Text>
              <Text style={styles.chamberSub}>{opt.sub}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>填充物 · Fragments</SectionTitle>
      <Pressable
        style={styles.addBtn}
        onPress={() => {
          openPicker();
          tap();
        }}
      >
        <Text style={styles.addPlus}>＋</Text>
        <Text style={styles.addLabel}>添加填充物</Text>
      </Pressable>

      <View style={styles.countRow}>
        <Text style={styles.countText}>当前 {fragments.length} 块</Text>
        {fragments.length > 0 ? (
          <Pressable
            onPress={() => {
              clearFragments();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }}
          >
            <Text style={styles.clearText}>清空</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.hint}>
        点「添加」打开素材库,选碎片逐个投入。转动右侧旋钮,碎片受重力翻滚重排。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: theme.space(3), gap: theme.space(2) },
  sectionTitle: {
    color: theme.colors.textFaint,
    fontSize: theme.font.small,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: theme.space(2),
    marginBottom: theme.space(1),
  },
  mirrorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chamberRow: { flexDirection: 'row', gap: theme.space(2) },
  chamberCell: {
    flex: 1,
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.md,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chamberSub: { color: theme.colors.textFaint, fontSize: theme.font.tiny },
  mirrorCell: {
    width: 58,
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellActive: {
    backgroundColor: theme.colors.active,
    borderColor: theme.colors.accentGlow,
  },
  mirrorLabel: { color: theme.colors.textDim, fontSize: theme.font.tiny },
  labelActive: { color: theme.colors.text, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    paddingVertical: theme.space(3),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.active,
    borderWidth: 1,
    borderColor: theme.colors.accentGlow,
  },
  addPlus: { color: theme.colors.accent, fontSize: 20, fontWeight: '700' },
  addLabel: { color: theme.colors.text, fontSize: theme.font.label, fontWeight: '600' },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space(1),
  },
  countText: { color: theme.colors.textDim, fontSize: theme.font.small },
  clearText: { color: theme.colors.accent, fontSize: theme.font.small },
  hint: {
    color: theme.colors.textFaint,
    fontSize: theme.font.tiny,
    lineHeight: 16,
    marginTop: theme.space(1),
  },
});
