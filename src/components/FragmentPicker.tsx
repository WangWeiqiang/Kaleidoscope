import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { theme } from '@/theme';
import { useKaleidoscope } from '@/state/store';
import {
  FRAGMENT_CATALOG,
  FRAGMENT_THUMBS,
  type FragmentItem,
} from '@/fragments/catalog';

export function FragmentPicker() {
  const open = useKaleidoscope((s) => s.pickerOpen);
  const activeCat = useKaleidoscope((s) => s.activeCat);
  const fragments = useKaleidoscope((s) => s.fragments);
  const setActiveCat = useKaleidoscope((s) => s.setActiveCat);
  const addFragment = useKaleidoscope((s) => s.addFragment);
  const clearFragments = useKaleidoscope((s) => s.clearFragments);
  const closePicker = useKaleidoscope((s) => s.closePicker);

  const category = useMemo(
    () => FRAGMENT_CATALOG.find((c) => c.id === activeCat) ?? FRAGMENT_CATALOG[0],
    [activeCat],
  );

  // count of each item currently in the pile
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fragments) m[f.itemId] = (m[f.itemId] ?? 0) + 1;
    return m;
  }, [fragments]);

  const add = (item: FragmentItem) => {
    addFragment(item.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={closePicker}
    >
      <Pressable style={styles.backdrop} onPress={closePicker}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* header */}
          <View style={styles.header}>
            <Text style={styles.title}>填充物 · Fragments</Text>
            <View style={styles.headerRight}>
              <Text style={styles.total}>共 {fragments.length} 块</Text>
              <Pressable
                style={styles.clearBtn}
                onPress={() => {
                  clearFragments();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }}
              >
                <Text style={styles.clearText}>清空</Text>
              </Pressable>
              <Pressable style={styles.closeBtn} onPress={closePicker}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* category tabs */}
          <View style={styles.tabs}>
            {FRAGMENT_CATALOG.map((c) => {
              const on = c.id === category.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setActiveCat(c.id);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={[styles.tab, on && styles.tabOn]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>
                    {c.label}
                  </Text>
                  <Text style={[styles.tabEn, on && styles.tabTextOn]}>{c.en}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* item grid */}
          <ScrollView contentContainerStyle={styles.grid}>
            {category.items.map((item) => (
              <Pressable key={item.id} style={styles.card} onPress={() => add(item)}>
                <View style={styles.thumbWrap}>
                  <Image
                    source={FRAGMENT_THUMBS[item.file]}
                    style={styles.thumb}
                    resizeMode="contain"
                  />
                  {counts[item.id] ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{counts[item.id]}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <View style={styles.addBtn}>
                  <Text style={styles.addText}>＋</Text>
                </View>
              </Pressable>
            ))}
            {category.items.length === 0 ? (
              <Text style={styles.empty}>
                此分类暂无素材{'\n'}把 PNG 放入 assets/fragments/{category.id}/ 后运行 npm run fragments
              </Text>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: '80%',
    maxWidth: 640,
    maxHeight: '88%',
    backgroundColor: theme.colors.bgElev,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
    padding: theme.space(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space(3),
  },
  title: { color: theme.colors.text, fontSize: theme.font.title, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  total: { color: theme.colors.textDim, fontSize: theme.font.small },
  clearBtn: {
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  clearText: { color: theme.colors.textDim, fontSize: theme.font.small },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.panel,
  },
  closeText: { color: theme.colors.text, fontSize: 14 },
  tabs: { flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(3) },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabOn: { backgroundColor: theme.colors.active, borderColor: theme.colors.accentGlow },
  tabText: { color: theme.colors.textDim, fontSize: theme.font.label, fontWeight: '600' },
  tabEn: { color: theme.colors.textFaint, fontSize: theme.font.tiny },
  tabTextOn: { color: theme.colors.text },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(3),
    justifyContent: 'flex-start',
  },
  card: {
    width: 92,
    alignItems: 'center',
    padding: theme.space(2),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.panelBorder,
  },
  thumbWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#1a1530', fontSize: theme.font.tiny, fontWeight: '700' },
  cardLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.tiny,
    marginTop: 4,
    maxWidth: 80,
  },
  addBtn: {
    marginTop: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.active,
    borderWidth: 1,
    borderColor: theme.colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: theme.colors.accent, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  empty: {
    color: theme.colors.textFaint,
    fontSize: theme.font.small,
    textAlign: 'center',
    padding: theme.space(4),
    lineHeight: 18,
  },
});
