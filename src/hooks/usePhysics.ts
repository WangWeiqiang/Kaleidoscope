import { useEffect, useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { itemById } from '@/fragments/catalog';
import type { PlacedFragment } from '@/state/store';
import { MAX_FRAGMENTS } from '@/state/store';
import type { Drive } from './useDrive';

const TAU = Math.PI * 2;
const G = 1.9;          // gravity strength
const DAMP = 0.985;     // linear damping
const ADAMP = 0.94;     // angular damping
const REST = 0.35;      // wall restitution

interface Body {
  key: number;
  x: number; y: number;   // object-disc coords (radius 1)
  vx: number; vy: number;
  angle: number; va: number;
  radius: number;         // collision radius
  size: number;           // sprite size (object units)
  uv: [number, number, number, number];
}

/** Uniform-ready arrays the shader consumes (fragments already folded). */
export interface CellUniforms {
  fpos: number[];   // MAX*4 : x,y,angle,size
  fuv: number[];    // MAX*4 : atlas x,y,w,h
  fflip: number[];  // MAX
  count: number;
}

function makeBody(f: PlacedFragment): Body {
  const it = itemById(f.itemId);
  const sz = 0.16 + 0.12 * (it?.size ?? 1);
  return {
    key: f.key,
    x: (Math.random() - 0.5) * 1.0,
    y: -0.9,                       // drop in from the top
    vx: (Math.random() - 0.5) * 0.4,
    vy: 0,
    angle: Math.random() * TAU,
    va: (Math.random() - 0.5) * 3,
    radius: sz,
    size: sz,
    uv: (it?.uv ?? [0, 0, 1, 1]) as [number, number, number, number],
  };
}

/**
 * Gravity simulation of the loose fragment pile. Runs on the JS thread (so adds
 * and physics never fight over the data), publishing folded uniform arrays to a
 * shared value each frame. Fragments fall, collide and pile up; rotating the
 * chamber turns gravity so they cascade and resettle. When nothing moves the
 * pile reaches equilibrium and the image is effectively still.
 */
export function usePhysics(
  fragments: PlacedFragment[],
  mirrors: number,
  drive: Drive,
): SharedValue<CellUniforms> {
  const out = useSharedValue<CellUniforms>({
    fpos: new Array(MAX_FRAGMENTS * 4).fill(0),
    fuv: new Array(MAX_FRAGMENTS * 4).fill(0),
    fflip: new Array(MAX_FRAGMENTS).fill(0),
    count: 0,
  });

  const bodies = useRef<Body[]>([]);
  const mirrorsRef = useRef(mirrors);
  mirrorsRef.current = mirrors;

  // Reconcile bodies with the placed fragments (append new, drop removed).
  useEffect(() => {
    const byKey = new Map(bodies.current.map((b) => [b.key, b]));
    bodies.current = fragments.map((f) => byKey.get(f.key) ?? makeBody(f));
  }, [fragments]);

  // Simulation loop.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastChurn = drive.churn.value;

    const tick = (t: number) => {
      const dt = last ? Math.min((t - last) / 1000, 0.033) : 0.016;
      last = t;
      const b = bodies.current;
      const n = b.length;

      if (n > 0) {
        const rot = drive.rotation.value;
        // gravity in the chamber frame (world-down rotated by the chamber angle)
        const gx = Math.sin(rot) * G;
        const gy = Math.cos(rot) * G;
        // motion since last frame agitates the pile (so it visibly tumbles)
        const churn = drive.churn.value;
        const stir = Math.min(Math.abs(churn - lastChurn) * 8, 1.2);
        lastChurn = churn;

        for (let i = 0; i < n; i++) {
          const p = b[i];
          p.vx += gx * dt + (Math.random() - 0.5) * stir;
          p.vy += gy * dt + (Math.random() - 0.5) * stir;
          p.vx *= DAMP;
          p.vy *= DAMP;
          p.va = p.va * ADAMP + (Math.random() - 0.5) * stir;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.angle += p.va * dt;
        }

        // keep inside the circular chamber
        for (let i = 0; i < n; i++) {
          const p = b[i];
          const d = Math.hypot(p.x, p.y);
          const lim = 1 - p.radius * 0.5;
          if (d > lim && d > 1e-4) {
            const nx = p.x / d, ny = p.y / d;
            p.x = nx * lim;
            p.y = ny * lim;
            const vn = p.vx * nx + p.vy * ny;
            p.vx -= (1 + REST) * vn * nx;
            p.vy -= (1 + REST) * vn * ny;
          }
        }

        // pairwise separation → stacking
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = b[i], c = b[j];
            let dx = c.x - a.x, dy = c.y - a.y;
            let dist = Math.hypot(dx, dy);
            const minD = (a.radius + c.radius) * 0.5;
            if (dist < minD && dist > 1e-4) {
              dx /= dist; dy /= dist;
              const push = (minD - dist) * 0.5;
              a.x -= dx * push; a.y -= dy * push;
              c.x += dx * push; c.y += dy * push;
              const rv = (c.vx - a.vx) * dx + (c.vy - a.vy) * dy;
              if (rv < 0) {
                a.vx += rv * dx * 0.5; a.vy += rv * dy * 0.5;
                c.vx -= rv * dx * 0.5; c.vy -= rv * dy * 0.5;
              }
            }
          }
        }

        // fold each fragment into the fundamental wedge and pack uniforms
        const seg = TAU / mirrorsRef.current;
        const fpos = out.value.fpos;
        const fuv = out.value.fuv;
        const fflip = out.value.fflip;
        for (let i = 0; i < MAX_FRAGMENTS; i++) {
          if (i < n) {
            const p = b[i];
            const ang = Math.atan2(p.y, p.x);
            const r = Math.hypot(p.x, p.y);
            const la = ((ang % seg) + seg) % seg;
            const flip = la > seg * 0.5 ? 1 : 0;
            const af = flip ? seg - la : la;
            fpos[i * 4] = Math.cos(af) * r;
            fpos[i * 4 + 1] = Math.sin(af) * r;
            fpos[i * 4 + 2] = p.angle;
            fpos[i * 4 + 3] = p.size;
            fuv[i * 4] = p.uv[0];
            fuv[i * 4 + 1] = p.uv[1];
            fuv[i * 4 + 2] = p.uv[2];
            fuv[i * 4 + 3] = p.uv[3];
            fflip[i] = flip;
          } else {
            fpos[i * 4 + 3] = 0; // size 0 → skipped by the shader
          }
        }
        out.value = { fpos, fuv, fflip, count: n };
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drive, out]);

  return out;
}
