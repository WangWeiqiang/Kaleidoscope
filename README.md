# Kaleidoscope · 万花筒

A beautiful, physically-grounded kaleidoscope for **iOS and Android**, built with
Expo + React Native and a GPU shader (Skia / SkSL). Spin it with an on-screen
rotary knob, or tilt and shake your phone to drive it with the gyroscope and
accelerometer.

<p align="center">
  <img src="preview/contact-sheet.png" width="640" alt="Mirror counts (3/4/5/6/8) × materials (glass/paper/metal/plastic)">
</p>

## Features

- **Landscape, three-pane layout** — the square viewer sits in the centre; the
  left pane switches mirrors and fragments; the right pane holds the rotary knob
  and the motion mode.
- **Choose the mirror chamber** — 三角 / 四角 / 五角 / 六角 / 八角
  (triangle, square, pentagon, hexagon, octagon).
- **Choose the fragments** — 玻璃 / 纸片 / 金属 / 塑料
  (glass, paper, metal, plastic), each with its own light response.
- **Three drive modes**
  - **旋钮 Knob** — fling the weighted dial; the chamber coasts with momentum.
  - **转动 Tilt** — rotating the phone about the viewing axis spins the chamber
    (gyroscope).
  - **晃动 Shake** — shaking tumbles the fragments (accelerometer).

## The optics

A real kaleidoscope is a chamber of flat mirrors meeting at a central apex. Two
mirrors at an apex angle of `π / N` generate, by repeated reflection, a perfectly
symmetric rosette with **N-fold rotational symmetry and 2N total mirror images**
— the dihedral group *D<sub>N</sub>*. A regular N-gon mirror chamber is exactly N
such wedges, so it shows the same symmetry.

The shader reproduces this *by construction*: it folds the viewing angle into one
fundamental wedge and reflects across the mirror lines, which is mathematically
identical to tracing each light ray back through every mirror bounce. That is why
the seams always line up and the symmetry is exact — and why the selectable
mirror counts map to the symmetries you actually see:

| Mirrors | Apex angle | Symmetry seen |
|--------:|:----------:|:--------------|
| 3 (triangle) | 60° | 6-fold |
| 4 (square)   | 45° | 8-fold |
| 5 (pentagon) | 36° | 10-fold |
| 6 (hexagon)  | 30° | 12-fold |
| 8 (octagon)  | 22.5° | 16-fold |

Glass fragments additionally show **chromatic dispersion** at their edges (white
light splitting by wavelength), and every material is shaded with a real
diffuse + specular lighting model so it reads as its physical substance.

The whole pattern is generated on the GPU each frame from an animated Voronoi
"object cell", so it never repeats and runs at display refresh rate.

## Project layout

```
App.tsx                       three-pane landscape shell + orientation lock
src/shaders/kaleidoscope.ts   the SkSL shader + material / mirror registries
src/components/
  KaleidoscopeCanvas.tsx      Skia canvas; feeds uniforms from clock + drive
  LeftPanel.tsx               mirror + material selectors
  RightPanel.tsx              motion-mode toggle + rotary knob
  RotaryKnob.tsx              gesture-driven dial with momentum
  PolygonGlyph.tsx            crisp polygon icons (Skia)
src/hooks/useDrive.ts         knob / gyroscope / accelerometer → animated values
src/state/store.ts            zustand store (mirrors, material, mode)
scripts/                      asset generation + headless shader checks
```

## Develop

```bash
npm install
npm start            # Expo dev server — open in a dev build or Expo Go*
```

\* The gyroscope, haptics and Skia shader need a real device. Use a development
build (`npx expo run:ios` / `npx expo run:android`) or Expo Go on a phone;
the simulator works for layout but has no motion sensors.

Quality gates that run without a device:

```bash
npm run typecheck     # tsc --noEmit
npm run check:shader  # compiles the SkSL on the real Skia engine (CanvasKit)
npm run preview       # renders preview/*.png of every mirror × material combo
npm run assets        # regenerates the app icon / splash artwork
```

## Build & publish to the stores

This project is configured for **EAS Build / EAS Submit**.

```bash
npm i -g eas-cli
eas login
eas init                       # creates the EAS project + fills extra.eas.projectId
```

### iOS — App Store

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Requires an Apple Developer account. The bundle identifier is
`com.kaleidoscope.app`; the motion-usage string is already declared
(`NSMotionUsageDescription`) and the app is locked to landscape.

### Android — Google Play

```bash
eas build --platform android --profile production   # produces an .aab
eas submit --platform android --latest
```

Requires a Google Play Console account and a service-account key. The package is
`com.kaleidoscope.app` and `HIGH_SAMPLING_RATE_SENSORS` is declared for smooth
gyroscope sampling.

### Before first submit

- Set a real `extra.eas.projectId` (done by `eas init`).
- Bump `version` in `app.json` per release (EAS auto-increments the native
  build number via the `production` profile).
- Replace the procedural artwork in `assets/` if you want custom store icons
  (or tweak `scripts/generate-assets.mjs` and re-run `npm run assets`).

## Tech

Expo SDK 52 · React Native 0.76 · @shopify/react-native-skia · Reanimated 3 ·
react-native-gesture-handler · expo-sensors · zustand.
