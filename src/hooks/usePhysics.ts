import { useEffect, useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { itemById } from '@/fragments/catalog';
import type { ChamberMode, PlacedFragment } from '@/state/store';
import { MAX_FRAGMENTS } from '@/state/store';
import type { Drive } from './useDrive';

const TAU = Math.PI * 2;
const LIM = 0.97;        // chamber wall radius (object-disc units)

/**
 * Per-mode parameter sets. `dry` is a normal tumbling cell; `oil` is a
 * glycerine cell — strong viscous drag, near-neutral buoyancy, a whisper of
 * convection so the drift never quite dies, and no bounce at all.
 */
const MODES = {
  dry: {
    g: 2.1, lin: 0.45, ang: 1.1, rest: 0.1, wallRest: 0.18,
    muBody: 0.45, muWall: 0.6, convection: 0, sleeps: true,
  },
  oil: {
    g: 0.3, lin: 3.2, ang: 3.0, rest: 0, wallRest: 0,
    muBody: 0.25, muWall: 0.3, convection: 0.045, sleeps: false,
  },
} as const;

const REPOSE = 0.22;       // rad the gravity vector must swing to avalanche a settled pile
const STIR_THRESHOLD = 0.35; // accumulated churn that fires one agitation impulse
const SLEEP_V = 0.035;     // linear speed below which a body counts as still
const SLEEP_W = 0.15;      // angular speed below which a body counts as still
const SLEEP_FRAMES = 24;   // consecutive still frames before falling asleep

interface Body {
  key: number;
  x: number; y: number;     // object-disc coords (chamber radius 1)
  vx: number; vy: number;
  angle: number; va: number;
  size: number;             // sprite size (object units)
  sub: number;              // sub-circle offset along the local x axis
  rs: number;               // sub-circle radius
  invM: number; invI: number;
  matType: number;
  opacity: number;
  tumble: number;           // out-of-plane flip angle (3D tumbling)
  tumbleDir: number;        // ±1, fixed per body
  restTilt: number;         // resting lean — settled shards don't all lie flat
  asleep: boolean;
  still: number;            // consecutive still-frame counter
  uv: [number, number, number, number];
}

/** Uniform-ready arrays the shader consumes (raw disc space — pass 2 folds). */
export interface CellUniforms {
  fpos: number[];   // MAX*4 : x,y,angle,size
  fuv: number[];    // MAX*4 : atlas x,y,w,h
  fmat: number[];   // MAX*4 : matType, opacity, squash, facing
  count: number;
}

function makeBody(f: PlacedFragment, gravAngle: number): Body {
  const it = itemById(f.itemId);
  // size tier 1…10 → linear size ×0.55…×1.6 (roughly 1:8 by area)
  const tier = f.scale ?? 4.5;
  const sz = (0.20 + 0.14 * (it?.size ?? 1)) * (0.49 + 0.111 * tier);
  const weight = it?.weight ?? 1;
  const m = weight * sz * sz;
  const R = sz * 0.45;
  // scatter anywhere in the chamber (nudged away from the floor so it still
  // tumbles down into the pile), with a fully random throw — every shard
  // arrives differently, like tipping a pinch of glass into the cell
  const gx = Math.sin(gravAngle), gy = Math.cos(gravAngle);
  const sa = Math.random() * TAU;
  const sr = Math.sqrt(Math.random()) * 0.8;
  return {
    key: f.key,
    x: Math.cos(sa) * sr - gx * 0.18,
    y: Math.sin(sa) * sr - gy * 0.18,
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    angle: Math.random() * TAU,
    va: (Math.random() - 0.5) * 7,
    size: sz,
    sub: sz * 0.24,
    rs: sz * 0.38,
    invM: 1 / m,
    invI: 2 / (m * R * R),
    matType: it?.matType ?? 3,
    opacity: it?.opacity ?? 1,
    tumble: Math.random() * TAU,               // random flip phase mid-air
    tumbleDir: Math.random() < 0.5 ? 1 : -1,
    restTilt: (Math.random() - 0.5) * 1.1,     // each shard settles at its own lean
    asleep: false,
    still: 0,
    uv: (it?.uv ?? [0, 0, 1, 1]) as [number, number, number, number],
  };
}

/**
 * Gravity simulation of the loose fragment pile, built around the behaviours
 * that make a real kaleidoscope feel real:
 *
 *  · sleep = static friction — a settled pile is perfectly frozen (no idle
 *    jitter), and stays frozen while the chamber turns…
 *  · …until gravity has swung past the angle of repose, when the whole pile
 *    AVALANCHES at once into a new arrangement (the signature "click").
 *  · agitation is impulse events, not per-frame noise — shaking tosses the
 *    shards once per burst instead of making them vibrate.
 *  · every body is two circles with mass and moment of inertia; contacts apply
 *    friction impulses at the contact point, so shards roll, topple and wedge
 *    against each other instead of gliding like bubbles.
 *  · shards also tumble OUT of the plane while they move (foreshortening +
 *    face/back flips), which pass 1 renders as real 3D turning.
 *
 * Runs on the JS thread (adds and physics never fight over the data) and
 * publishes uniform arrays in raw disc space each frame — the view pass does
 * all folding, so the same pile is correct for every mirror count.
 */
export function usePhysics(
  fragments: PlacedFragment[],
  drive: Drive,
  chamber: ChamberMode,
): SharedValue<CellUniforms> {
  const out = useSharedValue<CellUniforms>({
    fpos: new Array(MAX_FRAGMENTS * 4).fill(0),
    fuv: new Array(MAX_FRAGMENTS * 4).fill(0),
    fmat: new Array(MAX_FRAGMENTS * 4).fill(0),
    count: 0,
  });

  const bodies = useRef<Body[]>([]);
  const chamberRef = useRef(chamber);
  chamberRef.current = chamber;

  // Reconcile bodies with the placed fragments (append new, drop removed).
  useEffect(() => {
    const byKey = new Map(bodies.current.map((b) => [b.key, b]));
    bodies.current = fragments.map(
      (f) => byKey.get(f.key) ?? makeBody(f, drive.rotation.value),
    );
    // a new arrival can land on a sleeping pile — wake everyone
    for (const b of bodies.current) { b.asleep = false; b.still = 0; }
  }, [fragments, drive]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastChurn = drive.churn.value;
    let stirAcc = 0;
    let settledGrav: number | null = null; // gravity angle when the pile went to sleep
    let time = 0;

    /** contact impulse with friction at point (px,py), normal (nx,ny) into A */
    const contact = (
      A: Body, B: Body | null,
      px: number, py: number, nx: number, ny: number, pen: number,
      rest: number, mu: number,
    ) => {
      const invMb = B ? B.invM : 0;
      const share = A.invM / (A.invM + invMb);
      A.x -= nx * pen * share; A.y -= ny * pen * share;
      if (B) { B.x += nx * pen * (1 - share); B.y += ny * pen * (1 - share); }

      const rax = px - A.x, ray = py - A.y;
      const rbx = B ? px - B.x : 0, rby = B ? py - B.y : 0;
      const avx = A.vx - A.va * ray, avy = A.vy + A.va * rax;
      const bvx = B ? B.vx - B.va * rby : 0, bvy = B ? B.vy + B.va * rbx : 0;
      const rvx = bvx - avx, rvy = bvy - avy;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) return 0;

      const caN = rax * ny - ray * nx;
      const cbN = B ? rbx * ny - rby * nx : 0;
      const kn = A.invM + invMb + caN * caN * A.invI + (B ? cbN * cbN * B.invI : 0);
      const jn = (-(1 + rest) * vn) / kn;
      A.vx -= jn * nx * A.invM; A.vy -= jn * ny * A.invM;
      A.va -= jn * caN * A.invI;
      if (B) {
        B.vx += jn * nx * B.invM; B.vy += jn * ny * B.invM;
        B.va += jn * cbN * B.invI;
      }

      // Coulomb friction along the tangent, clamped by the normal impulse.
      const tx = -ny, ty = nx;
      const caT = rax * ty - ray * tx;
      const cbT = B ? rbx * ty - rby * tx : 0;
      const kt = A.invM + invMb + caT * caT * A.invI + (B ? cbT * cbT * B.invI : 0);
      const vt = rvx * tx + rvy * ty;
      let jt = -vt / kt;
      const maxF = mu * Math.abs(jn);
      jt = Math.max(-maxF, Math.min(maxF, jt));
      A.vx -= jt * tx * A.invM; A.vy -= jt * ty * A.invM;
      A.va -= jt * caT * A.invI;
      if (B) {
        B.vx += jt * tx * B.invM; B.vy += jt * ty * B.invM;
        B.va += jt * cbT * B.invI;
      }
      return Math.abs(jn);
    };

    const tick = (t: number) => {
      const dt = last ? Math.min((t - last) / 1000, 0.033) : 0.016;
      last = t;
      time += dt;
      const P = MODES[chamberRef.current];
      const b = bodies.current;
      const n = b.length;

      if (n > 0) {
        const rot = drive.rotation.value;
        const gx = Math.sin(rot) * P.g;
        const gy = Math.cos(rot) * P.g;

        // -- agitation: accumulate churn, release it as discrete impulses
        const churn = drive.churn.value;
        stirAcc += Math.abs(churn - lastChurn);
        lastChurn = churn;
        let kick = 0;
        if (stirAcc > STIR_THRESHOLD) {
          kick = Math.min(stirAcc, 2.0);
          stirAcc = 0;
        }

        // -- avalanche: a settled pile holds (static friction) until gravity
        //    has swung past the angle of repose, then everything lets go
        const gravAngle = Math.atan2(gx, gy);
        const allAsleep = P.sleeps && b.every((p) => p.asleep);
        if (allAsleep) {
          if (settledGrav === null) settledGrav = gravAngle;
          let dAng = gravAngle - settledGrav;
          dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
          if (Math.abs(dAng) > REPOSE || kick > 0) {
            for (const p of b) { p.asleep = false; p.still = 0; }
            settledGrav = null;
          }
        } else {
          settledGrav = null;
        }

        const lin = Math.exp(-P.lin * dt);
        const ang = Math.exp(-P.ang * dt);
        for (const p of b) {
          if (kick > 0) {
            p.asleep = false; p.still = 0;
            p.vx += (Math.random() - 0.5) * 1.6 * kick;
            p.vy += (Math.random() - 0.5) * 1.6 * kick - gy * 0.25 * kick;
            p.va += (Math.random() - 0.5) * 7 * kick;
            p.tumble += (Math.random() - 0.5) * 2.5 * kick;
          }
          if (p.asleep) continue;
          p.vx += gx * dt;
          p.vy += gy * dt;
          if (P.convection > 0) {
            // slow glycerine convection — the drift never quite dies
            p.vx += Math.sin(time * 0.37 + p.y * 3.1 + p.key) * P.convection * dt;
            p.vy += Math.cos(time * 0.29 + p.x * 2.7 + p.key * 0.7) * P.convection * dt;
          }
          p.vx *= lin; p.vy *= lin;
          p.va *= ang;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.angle += p.va * dt;

          // out-of-plane tumbling follows in-plane motion, then settles toward
          // each shard's own resting lean (piles are never uniformly flat)
          const speed = Math.hypot(p.vx, p.vy);
          p.tumble += p.tumbleDir * (2.6 * speed + 0.35 * Math.abs(p.va)) * dt;
          if (speed < 0.25) {
            p.tumble -= Math.sin(2 * (p.tumble - p.restTilt)) * 2.2 * dt;
          }
        }

        // -- chamber wall, per sub-circle (friction makes shards roll along it)
        for (const p of b) {
          if (p.asleep) continue;
          const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            const ox = p.x + ca * p.sub * sgn;
            const oy = p.y + sa * p.sub * sgn;
            const d = Math.hypot(ox, oy);
            const lim = LIM - p.rs;
            if (d > lim && d > 1e-4) {
              contact(p, null, ox, oy, ox / d, oy / d, d - lim, P.wallRest, P.muWall);
            }
          }
        }

        // -- body/body contacts between sub-circles (torque + friction)
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const A = b[i], B = b[j];
            const cA = Math.cos(A.angle), sA = Math.sin(A.angle);
            const cB = Math.cos(B.angle), sB = Math.sin(B.angle);
            for (let u = -1; u <= 1; u += 2) {
              const ax = A.x + cA * A.sub * u, ay = A.y + sA * A.sub * u;
              for (let v = -1; v <= 1; v += 2) {
                const bx = B.x + cB * B.sub * v, by = B.y + sB * B.sub * v;
                let dx = bx - ax, dy = by - ay;
                const dist = Math.hypot(dx, dy);
                const minD = A.rs + B.rs;
                if (dist < minD && dist > 1e-4) {
                  dx /= dist; dy /= dist;
                  const woke = !A.asleep || !B.asleep;
                  if (!woke) continue;
                  if (A.asleep) { A.asleep = false; A.still = 0; }
                  if (B.asleep) { B.asleep = false; B.still = 0; }
                  const px = ax + dx * A.rs, py = ay + dy * A.rs;
                  // note: normal points from A towards B
                  contact(B, A, px, py, -dx, -dy, (minD - dist) * 0.6, P.rest, P.muBody);
                }
              }
            }
          }
        }

        // -- sleep bookkeeping (static friction): still long enough → frozen
        if (P.sleeps) {
          for (const p of b) {
            if (p.asleep) continue;
            const slow =
              p.vx * p.vx + p.vy * p.vy < SLEEP_V * SLEEP_V &&
              Math.abs(p.va) < SLEEP_W;
            p.still = slow ? p.still + 1 : 0;
            if (p.still > SLEEP_FRAMES) {
              p.asleep = true;
              p.vx = 0; p.vy = 0; p.va = 0;
            }
          }
        }

        // -- publish uniforms (raw disc space; the view pass folds)
        const { fpos, fuv, fmat } = out.value;
        for (let i = 0; i < MAX_FRAGMENTS; i++) {
          if (i < n) {
            const p = b[i];
            const cosT = Math.cos(p.tumble);
            fpos[i * 4] = p.x;
            fpos[i * 4 + 1] = p.y;
            fpos[i * 4 + 2] = p.angle;
            fpos[i * 4 + 3] = p.size;
            fuv[i * 4] = p.uv[0];
            fuv[i * 4 + 1] = p.uv[1];
            fuv[i * 4 + 2] = p.uv[2];
            fuv[i * 4 + 3] = p.uv[3];
            fmat[i * 4] = p.matType;
            fmat[i * 4 + 1] = p.opacity;
            fmat[i * 4 + 2] = Math.max(Math.abs(cosT), 0.15); // foreshortening
            fmat[i * 4 + 3] = cosT >= 0 ? 1 : -1;             // face / back
          } else {
            fpos[i * 4 + 3] = 0; // size 0 → skipped by the shader
          }
        }
        out.value = { fpos, fuv, fmat, count: n };
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drive, out]);

  return out;
}
