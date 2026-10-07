// Sparks, rain, fireflies and lanterns. None of it affects the town, so all of
// it is made up here in the browser from what the town is doing.

import { C, CITY, SW, SY, WW, modTop, pick, rnd } from "./defs";
import type { Effect, View } from "./view";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  s: number;
  rain?: boolean;
  drip?: boolean;
  fly?: boolean;
  lantern?: boolean;
  note?: boolean;
}

export interface Cloud {
  x: number;
  y: number;
  w: number;
  v: number;
}

const FIREWORKS = [C.sun, C.cyan, C.magenta];

/** One step of the particle world; `tick` counts steps, thirty to the second. */
export function stepParticles(
  particles: Particle[],
  clouds: Cloud[],
  view: View,
  tick: number,
  dt: number,
  cameraTop: number,
) {
  const daylight = view.daylight();

  for (const a of view.agents) {
    if (!a.placed) continue;
    switch (a.state) {
      case "build": {
        const p = view.projects.find((p) => p.id === a.proj);
        if (p && tick % 7 === 0)
          particles.push({
            x: p.s * SW + rnd(4, 36),
            y: modTop(p.L) + rnd(4, 28),
            vx: rnd(-6, 6),
            vy: rnd(-10, -2),
            life: 0.45,
            c: pick([C.sun, C.cream]),
            s: 1,
          });
        break;
      }
      case "soak":
        if (tick % 12 === 0)
          particles.push({ x: a.px, y: a.py - 12, vx: 0, vy: -6, life: 0.8, c: C.cream, s: 1 });
        break;
      case "paint":
        if (tick % 6 === 0)
          particles.push({
            x: a.px + (a.face > 0 ? 6 : -6),
            y: a.py - 9 + rnd(-4, 4),
            vx: 0,
            vy: -3,
            life: 0.4,
            c: pick([C.magenta, C.cyan, C.sun, C.leafL]),
            s: 1,
          });
        break;
      case "dine":
        if (a.musician && tick % 10 === 0)
          particles.push({
            x: a.px + rnd(-3, 3),
            y: a.py - 14,
            vx: rnd(-3, 3),
            vy: -7,
            life: 1.4,
            c: pick([C.magenta, C.sun, C.cyan]),
            s: 2,
            note: true,
          });
        if (tick % 14 === 0 && Math.random() < 0.4)
          particles.push({
            x: a.px + (a.face > 0 ? 5 : -5),
            y: a.py - 8,
            vx: rnd(-2, 2),
            vy: -5,
            life: 0.9,
            c: "rgba(232,225,190,0.7)",
            s: 1,
          });
        break;
      case "festival":
        if (view.festival > 0 && tick % 4 === 0 && Math.random() < 0.15)
          particles.push({
            x: a.px + rnd(-2, 2),
            y: a.py - 14,
            vx: rnd(-4, 4),
            vy: -6,
            life: rnd(14, 24),
            c: pick([C.sun, "#e29a2a", C.magenta]),
            s: 2,
            lantern: true,
          });
        break;
    }
  }

  if (daylight < 0.35 && tick % 5 === 0) {
    for (const tr of view.trees)
      if (Math.random() < 0.25)
        particles.push({
          x: tr.x + rnd(-10, 10),
          y: SY - 10 - tr.size * 5 - rnd(0, 14),
          vx: rnd(-6, 6),
          vy: rnd(-4, 2),
          life: rnd(1.5, 3),
          c: C.sun,
          s: 1,
          fly: true,
        });
    for (const f of view.wildFloors())
      if (f.moth > 2 && Math.random() < 0.12)
        particles.push({
          x: f.s * SW + rnd(0, 40),
          y: modTop(f.L) + rnd(4, 20),
          vx: rnd(-8, 8),
          vy: rnd(-5, 1),
          life: rnd(2, 4),
          c: C.sun,
          s: 1,
          fly: true,
        });
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.fly) {
      p.vx += rnd(-30, 30) * dt;
      p.vy += rnd(-30, 30) * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    if (p.lantern) {
      p.vx = Math.sin(view.simTime * 0.8 + p.x) * 4;
      p.vy = Math.max(-14, p.vy - 4 * dt);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.rain || p.fly || p.lantern || p.note ? 0 : 20) * dt;
    p.life -= dt;
    if (p.rain && p.y > SY - 2) {
      particles.splice(i, 1);
      if (Math.random() < 0.25)
        particles.push({
          x: p.x,
          y: SY - 3,
          vx: rnd(-12, 12),
          vy: rnd(-18, -6),
          life: 0.25,
          c: "rgba(180,230,235,0.8)",
          s: 1,
        });
      continue;
    }
    if (p.life <= 0) particles.splice(i, 1);
  }

  if (view.rainNow) {
    const stormy = view.storm > 0;
    for (let i = 0; i < (stormy ? 10 : 6); i++)
      particles.push({
        x: rnd(-20, WW + 20),
        y: Math.max(0, cameraTop) + rnd(-60, 0),
        vx: view.wind * (stormy ? 2.2 : 1),
        vy: rnd(120, 160),
        life: rnd(3, 6),
        c: i % 3 ? "rgba(140,215,225,0.55)" : "rgba(242,193,78,0.35)",
        s: 1,
        rain: true,
      });
    if (tick % 3 === 0)
      for (const sl of CITY) {
        const h = view.heightOf(sl);
        if (h > 0 && Math.random() < 0.5)
          particles.push({
            x: sl * SW + rnd(0, SW),
            y: modTop(h) - 3,
            vx: 0,
            vy: 40,
            life: 0.6,
            c: "rgba(140,215,225,0.7)",
            s: 1,
            drip: true,
          });
      }
  }

  for (const c of clouds) {
    c.x += c.v * dt;
    if (c.x > WW + 80) c.x = -80;
  }
}

/** The burst that marks something the server reported. */
export function burst(particles: Particle[], view: View, effect: Effect) {
  switch (effect.fx) {
    case "built":
      for (let i = 0; i < 16; i++)
        particles.push({
          x: effect.x,
          y: effect.y,
          vx: rnd(-25, 25),
          vy: rnd(-30, -5),
          life: rnd(0.5, 1),
          c: pick(FIREWORKS),
          s: 1,
        });
      break;
    case "cottage":
      for (let i = 0; i < 10; i++)
        particles.push({
          x: effect.x,
          y: effect.y,
          vx: rnd(-20, 20),
          vy: rnd(-25, -5),
          life: rnd(0.5, 1),
          c: pick([C.sun, C.leafL, C.magenta]),
          s: 1,
        });
      break;
    case "wild":
      for (const f of view.wildFloors())
        for (let i = 0; i < 20; i++)
          particles.push({
            x: f.s * SW + 20 + rnd(-20, 20),
            y: modTop(f.L) + rnd(-10, 20),
            vx: rnd(-60, 60),
            vy: rnd(-90, -20),
            life: rnd(1, 2.5),
            c: pick([C.sun, C.cyan, C.magenta, C.leafL, C.cream]),
            s: 1,
          });
      break;
  }
}
