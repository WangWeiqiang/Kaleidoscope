/** Shared visual language — a refined, jewel-box dark UI. */
export const theme = {
  colors: {
    bg: '#05060a',
    bgElev: '#0d0f17',
    panel: 'rgba(20, 22, 33, 0.66)',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    stroke: 'rgba(255, 255, 255, 0.12)',
    text: '#f3f1fb',
    textDim: 'rgba(243, 241, 251, 0.55)',
    textFaint: 'rgba(243, 241, 251, 0.32)',
    accent: '#b69cff',
    accent2: '#6ad7ff',
    accentGlow: 'rgba(182, 156, 255, 0.45)',
    active: 'rgba(182, 156, 255, 0.18)',
    knobFace: '#15171f',
    knobRim: 'rgba(255, 255, 255, 0.10)',
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },
  space: (n: number) => n * 4,
  font: {
    title: 18,
    label: 14,
    small: 12,
    tiny: 10,
  },
} as const;

export type Theme = typeof theme;
