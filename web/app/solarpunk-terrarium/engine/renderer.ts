// Drawing, carried over from the original Sunhollow page nearly line for line.
// It reads the town from a View instead of simulating it.

import { ART } from "./art";
import {
  BLD,
  C,
  CITY,
  H,
  HX,
  MH,
  PAL,
  SW,
  SY,
  W,
  WH,
  WW,
  capOffset,
  feetY,
  modTop,
  rint,
  rnd,
} from "./defs";
import type { Cloud, Particle } from "./particles";
import type { Agent, Cottage, Project, Room, Tree, View } from "./view";

export interface Camera {
  zoom: number;
  x: number;
  y: number;
  /** Whether the camera follows the tender being followed. */
  track: boolean;
}

export const ZFIT = Math.min(W / WW, H / WH),
  ZOOMS = [ZFIT, 1, 2, 3, 4];

export type Sprites = Record<string, HTMLCanvasElement>;

export function loadSprites(): Sprites {
  const SPR: Sprites = {};
  let cur: string | null = null,
    rows: string[] = [];
  const flush = () => {
    if (!cur) return;
    const w = Math.max(...rows.map((r) => r.length)),
      h = rows.length,
      c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    rows.forEach((r, y) => {
      for (let i = 0; i < r.length; i++) {
        const p = PAL[r[i]];
        if (p) {
          x.fillStyle = p;
          x.fillRect(i, y, 1, 1);
        }
      }
    });
    SPR[cur] = c;
  };
  for (const line of ART.split("\n")) {
    if (line.startsWith("#")) {
      flush();
      cur = line.slice(1).trim();
      rows = [];
    } else if (cur && line.trim().length) rows.push(line);
  }
  flush();
  return SPR;
}

export interface Star {
  x: number;
  y: number;
  b: number;
}

export function createRenderer(
  cv: HTMLCanvasElement,
  SPR: Sprites,
  cam: Camera,
  particles: Particle[],
  stars: Star[],
  clouds: Cloud[],
) {
  const ctx = cv.getContext("2d")!;
  const wc = document.createElement("canvas");
  wc.width = WW;
  wc.height = WH;
  const g = wc.getContext("2d")!;

  // What the drawing code below reads, under the names it has always used.
  let view: View;
  let frame = 0;
  let followed: Agent | null = null;
  let agents: Agent[], projects: Project[], trees: Tree[], street: Room[], cottages: Cottage[];
  let stock: View["stock"], flow: View["flow"], ship: View["ship"], cat: View["cat"];
  let fox: View["fox"], birds: View["birds"], shooters: View["shooters"];
  let waterCap = 0,
    lightCap = 0,
    spill = 0,
    supper = 0,
    blackout = 0,
    bell = 0,
    flash = 0,
    tod = 0,
    simTime = 0,
    forestHealth = 0;
  let marker: number | null = null,
    kiteDay = false,
    rainNow = false,
    wildSlots: number[] = [];

  const M = (s: number, L: number) => view.M(s, L);
  const allMods = () => view.rooms;
  const heightOf = (s: number) => view.heightOf(s);
  const depthOf = (s: number) => view.depthOf(s);
  const cityHeight = () => view.cityHeight();
  const theHall = () => view.find("hall");
  const theLagoon = () => view.find("lagoon");
  const daylightNow = () => view.daylight();

  function px(x: number, y: number, w: number, h: number, c: string) {
    g.fillStyle = c;
    g.fillRect(x | 0, y | 0, w, h);
  }
  const spr = (name: string, x: number, y: number) => {
    const s = SPR[name];
    if (s) g.drawImage(s, x | 0, y | 0);
  };
  function drawAtrium(b: Room) {
    const x = b.s * SW,
      top = modTop(b.L + 2),
      bot = modTop(b.L) + 32,
      t = simTime,
      dl = daylightNow(),
      w = 80,
      h = bot - top,
      seed = b.seed * 100;
    px(x, top, w, h, "#22403f");
    px(x, top, w, 1, C.night);
    px(x, bot - 1, w, 1, C.night);
    px(x, top, 1, h, C.night);
    px(x + w - 1, top, 1, h, C.night);
    px(x + 1, top + 1, w - 2, 3, "#cdeff5");
    px(x + 1, top + 1, 1, h - 2, C.copper);
    px(x + w - 2, top + 1, 1, h - 2, C.copper);
    for (let i = 0; i < 5; i++) px(x + 1 + i * 19, top + 1, 1, 4, C.copper);
    for (let yy = top + 8; yy < bot - 8; yy += 12) {
      px(x + 2, yy, 1, 1, "#cdeff5");
      px(x + w - 3, yy + 6, 1, 1, "#cdeff5");
    }
    if (dl > 0.4)
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < h - 12; k++)
          if ((k + i * 7) % 3 === 0)
            px(x + 10 + i * 18 + k * 0.25, top + 5 + k, 1, 1, "rgba(232,225,190,0.10)");
      }
    px(x + 1, bot - 9, w - 2, 8, "#5a4326");
    px(x + 1, bot - 9, w - 2, 1, "#7a5a34");
    for (let i = 0; i < 8; i++) px(x + 4 + i * 10, bot - 6 + (i % 2), 2, 1, "#3b2a18");
    const under = Math.round(b.plants / 6);
    for (let i = 0; i < under; i++) {
      const fx = x + 3 + ((seed + i * 13) % 74),
        fh = 2 + ((seed + i * 7) % 5);
      px(fx, bot - 9 - fh, 1, fh, b.plants < 25 ? "#7a6b34" : C.leaf);
      px(fx + 1, bot - 9 - fh + 1, 1, 1, C.leafL);
    }
    for (const c of b.cedars) {
      const cx = x + c.x,
        ch = Math.round(8 + c.h * (h - 22)),
        dk = c.seed > 0.5 ? "#1e4a2b" : "#24573a",
        lt = c.seed > 0.5 ? "#2f7a44" : "#357f4e";
      px(cx, bot - 9 - ch, 2, ch, "#5a3a22");
      px(cx, bot - 9 - ch, 1, ch, "#7a5a34");
      px(cx - 2, bot - 10, 6, 1, "#5a3a22");
      const tiers = 2 + Math.floor(c.h * 7),
        gap = Math.max(4, (ch - 8) / tiers);
      for (let tI = 0; tI < tiers; tI++) {
        const ty = Math.round(bot - 9 - ch + 3 + tI * gap),
          tw = Math.min(13, 3 + Math.round(tI * 1.4)),
          lean = Math.round(Math.sin(c.seed * 9 + tI) * 1);
        px(cx + 1 - Math.floor(tw / 2) + lean, ty, tw, 2, dk);
        px(cx + 1 - Math.floor(tw / 2) + 1 + lean, ty - 1, tw - 2, 1, lt);
        if (tw > 5)
          px(cx + 1 - Math.floor(tw / 2) + lean, ty + 2, Math.max(1, tw - 4), 1, "#173a22");
        if (tI % 3 === 1 && (frame >> 3) % 2)
          px(cx + 1 + Math.floor(tw / 2) - 1 + lean, ty, 1, 1, C.leafL);
      }
      px(cx, bot - 9 - ch - 3, 2, 3, lt);
      px(cx, bot - 9 - ch - 4, 1, 1, C.leafL);
    }
    for (let L = 1; L <= 2; L++) {
      const wy = modTop(b.L + L) + 29;
      px(x + 1, wy, w - 2, 1, "#8a5a34");
      px(x + 1, wy + 1, w - 2, 1, C.night);
      for (let i = 0; i < 8; i++) px(x + 5 + i * 10, wy - 1, 1, 1, C.copper);
    }
    const K = Math.min;
    const mc = K(10, Math.round(b.moth));
    for (let i = 0; i < mc; i++) {
      const ph = t * (1.1 + i * 0.13) + i;
      px(
        x + 8 + ((seed + i * 17) % 64) + Math.sin(ph * 2) * 3,
        top + 14 + ((i * 9) % (h - 30)) + Math.cos(ph * 3) * 2,
        1,
        1,
        C.sun,
      );
    }
    const nc = K(8, Math.round(b.finch));
    for (let i = 0; i < nc; i++) {
      const ph = t * (0.7 + i * 0.12) + i * 2;
      const bx = x + 40 + Math.cos(ph * 0.8 + i) * 30,
        by = top + 16 + ((i * 13) % (h * 0.5)) + Math.sin(ph * 1.6) * 5;
      px(bx, by, 2, 1, C.magenta);
      px(bx + (Math.sin(ph * 7) > 0 ? -1 : 2), by - 1, 1, 1, "#f2a5cb");
    }
    const fc = K(6, Math.round(b.frog));
    for (let i = 0; i < fc; i++) {
      const ph = t * (1.0 + i * 0.2) + i * 3;
      const hop = Math.abs(Math.sin(ph * 1.5)),
        fxp = x + 5 + ((seed + i * 19 + Math.floor(ph / 6) * 5) % 70);
      px(fxp, bot - 11 - hop * 5, 2, 2, C.leafL);
    }
    const hc = K(4, Math.round(b.heron));
    for (let i = 0; i < hc; i++) {
      const c = b.cedars[(i * 2) % 5],
        hx = x + c.x + 1,
        hy = bot - 9 - Math.round(8 + c.h * (h - 22)) + 6 + i * 3;
      px(hx + 3, hy - 7, 1, 7, C.cyan);
      px(hx + 2, hy - 9, 3, 2, C.cyan);
      px(hx + 5, hy - 9, 2, 1, C.sun);
    }
    const gc = K(5, Math.round(b.goat));
    for (let i = 0; i < gc; i++) {
      const ph = t * 0.5 + i * 4;
      const gx = x + 6 + ((seed + i * 23 + Math.floor(ph / 8) * 7) % 66),
        step = (frame >> 4) & 1;
      px(gx, bot - 12, 5, 3, "#e9dcc0");
      px(gx + 4, bot - 14, 2, 2, "#e9dcc0");
      px(gx + 1, bot - 9, 1, 1 + step, "#7a6b34");
      px(gx + 3, bot - 9, 1, 2 - step, "#7a6b34");
    }
    drawLife(x, top, bot, w, seed, t, dl, b.canopy || 0);
    {
      const c = b.cedars[2];
      const cx = x + c.x,
        ch = Math.round(8 + c.h * (h - 22));
      const sq = bot - 12 - Math.abs(Math.sin(t * 0.9 + seed)) * Math.min(ch - 6, 30);
      px(cx + 1, sq, 3, 2, "#8a5a34");
      px(cx, sq - 1, 1, 2, "#a17a4a");
      if (dl < 0.35) {
        const oy = bot - 9 - ch + Math.round((ch - 8) * 0.4);
        px(cx - 5, oy, 3, 4, "#3b2a18");
        px(cx - 5, oy + 1, 1, 1, (frame >> 4) & 1 ? C.sun : "#3b2a18");
        px(cx - 3, oy + 1, 1, 1, (frame >> 4) & 1 ? C.sun : "#3b2a18");
      }
    }
    for (const c of b.cottages || []) drawCottage(c, dl);
    if (b.water < 0.3) px(x + w - 8, top + 6, 3, 3, "#e0563f");
  }
  function drawLagoon(b: Room) {
    const x = b.s * SW,
      gy = modTop(b.L),
      top = modTop(b.L + 2),
      t = simTime,
      seed = b.seed * 100,
      w = 80,
      th = 64;
    px(x, gy, w, 32, "#1e3a44");
    px(x, gy + 29, w, 2, C.stoneD);
    px(x, gy + 28, w, 1, C.stone);
    px(x, gy + 31, w, 1, C.night);
    px(x, gy, 1, 32, C.night);
    px(x + w - 1, gy, 1, 32, C.night);
    for (let i = 0; i < 3; i++) {
      const cx = x + 13 + i * 27;
      px(cx - 6, gy + 6, 12, 12, C.copper);
      px(cx - 5, gy + 7, 10, 10, "#2a7f8e");
      px(cx - 3, gy + 9, 6, 6, "#57c5d6");
      px(cx - 1, gy + 9, 2, 2, "#cdeff5");
    }
    px(x + 4, gy + 20, 6, 8, "#5a4326");
    px(x + 70, gy + 20, 6, 8, "#5a4326");
    px(x + 34, gy + 22, 12, 2, C.copper);
    px(x, top, w, th, "#12303a");
    px(x, top, w, 1, C.night);
    px(x, top, 1, th, C.night);
    px(x + w - 1, top, 1, th, C.night);
    px(x + 1, top + 1, 1, th - 2, C.copper);
    px(x + w - 2, top + 1, 1, th - 2, C.copper);
    px(x + 1, top + 1, w - 2, 2, C.copper);
    px(x + 1, top + th - 2, w - 2, 2, C.copper);
    for (let i = 1; i < 4; i++) px(x + i * 20, top + 1, 1, th - 2, "rgba(196,109,59,0.5)");
    const wl = Math.round((th - 6) * b.level),
      wy = top + th - 3 - wl;
    if (wl > 0) {
      px(x + 2, wy, w - 4, wl, "rgba(47,143,166,0.85)");
      px(x + 2, wy, w - 4, 1, "#7fd4e0");
      for (let i = 0; i < 4; i++)
        px(x + 6 + ((frame * 0.6 + i * 23) % 68), wy + 1, 3, 1, "rgba(205,239,245,0.5)");
      const k = Math.round(b.plants / 7);
      for (let i = 0; i < k; i++) {
        const kx = x + 5 + ((seed + i * 11) % 70),
          kh = Math.min(wl - 2, 6 + ((seed + i * 7) % 18));
        for (let j = 0; j < kh; j++)
          px(
            kx + Math.round(Math.sin(t * 1.5 + j * 0.5 + i) * 1.2),
            top + th - 4 - j,
            1,
            1,
            j % 3 ? "#2f7a44" : "#6fbf73",
          );
      }
      const mc = Math.min(12, Math.round(b.minnow));
      for (let i = 0; i < mc; i++) {
        const ph = t * (0.9 + i * 0.11) + i * 1.7;
        const fx = x + 40 + Math.cos(ph * 0.7) * 33,
          fy =
            Math.max(wy + 3, top + th - 8 - ((i * 9) % Math.max(1, wl - 6))) + Math.sin(ph * 2) * 2,
          dir = Math.cos(ph * 0.7 + Math.PI / 2) > 0 ? 1 : -1;
        px(fx, fy, 3, 1, "#9fd8e8");
        px(fx + (dir > 0 ? -1 : 3), fy, 1, 1, "#6be3d9");
        px(fx + (dir > 0 ? 2 : 0), fy, 1, 1, C.night);
      }
      const pc = Math.min(3, Math.round(b.pike));
      for (let i = 0; i < pc; i++) {
        const ph = t * 0.35 + i * 2;
        const fx = x + 40 + Math.cos(ph) * 28,
          fy = Math.max(wy + 4, wy + 8 + i * 9) + Math.sin(ph * 1.3) * 2,
          dir = Math.sin(ph) < 0 ? 1 : -1;
        px(fx - 3, fy, 7, 2, "#c47bd9");
        px(fx + (dir > 0 ? 4 : -4), fy - 1, 1, 4, "#a05fb8");
        px(fx + (dir > 0 ? 3 : -3), fy, 1, 1, C.night);
      }
      const cc = Math.min(5, Math.round(b.crab));
      for (let i = 0; i < cc; i++) {
        const cx = x + 8 + ((seed + i * 17 + Math.floor(t / 5 + i) * 3) % 64),
          cy = top + th - 6;
        px(cx, cy, 5, 2, "#e0563f");
        px(cx - 1, cy - 1, 1, 1, "#e0563f");
        px(cx + 5, cy - 1, 1, 1, "#e0563f");
        px(cx + 1, cy + 2, 1, 1, C.night);
        px(cx + 3, cy + 2, 1, 1, C.night);
      }
    }
    if (b.level < 0.35) px(x + w - 8, top + 5, 3, 3, "#e0563f");
    px(x + w - 4, top + 6, 3, 2, C.copper);
    if (b.level >= 0.98) px(x + w - 2, top + 8 + ((frame >> 1) % 6), 1, 1, "#7fd4e0");
  }
  function drawHall(b: Pick<Room, "s" | "L">) {
    const x = b.s * SW,
      y = modTop(b.L),
      dl = daylightNow(),
      w = 80,
      eating = supper > 0;
    px(x, y, w, 32, "#e9dcc0");
    px(x, y, w, 1, C.night);
    px(x, y + 31, w, 1, C.night);
    px(x, y, 1, 32, C.night);
    px(x + w - 1, y, 1, 32, C.night);
    px(x + 1, y + 1, w - 2, 2, "#d9cbae");
    px(x + 1, y + 28, w - 2, 1, "#b3c3c6");
    px(x + 1, y + 29, w - 2, 2, "#6f8487");
    px(x + 1, y + 27, w - 2, 1, C.night);
    px(x + 1, y + 3, 1, 25, C.copper);
    px(x + w - 2, y + 3, 1, 25, C.copper);
    for (let i = 0; i < 3; i++) {
      px(x + 3 + i * 6, y + 4, 1, 4, "#7a5a34");
    } // wall slats
    // kitchen (right end)
    px(x + 58, y + 14, 20, 13, "#8a5a34");
    px(x + 58, y + 13, 20, 1, C.night);
    px(x + 58, y + 14, 20, 1, "#a17a4a");
    px(x + 61, y + 17, 5, 4, "#c46d3b");
    px(x + 61, y + 16, 5, 1, C.night);
    px(x + 69, y + 16, 7, 6, "#6f8487");
    px(x + 70, y + 15, 5, 1, C.night);
    px(x + 70, y + 17, 5, 3, "#3b5a66");
    px(x + 62, y + 22, 3, 2, eating || dl < 0.4 ? C.sun : "#e29a2a");
    px(x + 63, y + 21, 1, 1, eating ? "#e0563f" : "#e29a2a");
    px(x + 71, y + 3, 4, 11, "#6f8487");
    px(x + 70, y + 3, 6, 1, C.night);
    px(x + 72, y - 6, 3, 10, "#6f8487");
    px(x + 71, y - 7, 5, 1, C.night);
    if (eating) {
      const pf = (frame >> 3) % 3;
      px(x + 72, y + 12 - pf, 1, 1, "rgba(232,225,190,0.8)");
      px(x + 73, y + 10 - pf, 1, 1, "rgba(232,225,190,0.6)");
      px(x + 73, y - 9 - ((frame >> 2) % 5), 2, 2, "#c7d3d0");
    }
    // long table and benches
    px(x + 6, y + 21, 48, 2, "#7a5a34");
    px(x + 6, y + 20, 48, 1, "#a17a4a");
    px(x + 8, y + 23, 2, 4, "#5a4326");
    px(x + 50, y + 23, 2, 4, "#5a4326");
    px(x + 29, y + 23, 2, 4, "#5a4326");
    px(x + 4, y + 25, 52, 1, "#5a4326");
    for (let i = 0; i < 6; i++) px(x + 9 + i * 8, y + 19, 3, 1, i % 2 ? C.cream : "#d98b3a");
    // lantern string
    for (let i = 0; i < 7; i++) {
      px(x + 6 + i * 11, y + 3, 1, 4, C.night);
      px(x + 5 + i * 11, y + 7, 3, 3, ((frame >> 3) + i) % 5 ? C.sun : "#e29a2a");
      px(x + 6 + i * 11, y + 6, 1, 1, C.night);
    }
    for (let i = 0; i < w - 2; i += 3) px(x + 1 + i, y + 3 + (i % 6 ? 0 : 1), 1, 1, "#7a5a34");
    // plants on a shelf (left)
    px(x + 3, y + 12, 14, 1, "#7a5a34");
    px(x + 4, y + 9, 2, 3, C.leaf);
    px(x + 5, y + 8, 1, 1, C.leafL);
    px(x + 9, y + 9, 3, 3, C.leafD);
    px(x + 10, y + 8, 1, 1, C.leafL);
    px(x + 14, y + 10, 2, 2, C.leaf);
    if (eating && (frame >> 4) % 2) px(x + 40, y + 12, 1, 1, "#f2a5cb");
  }
  function shell(x: number, y: number, wall: string, shade: string, floor?: string) {
    px(x, y, SW, MH, wall);
    px(x + 1, y + 1, SW - 2, 2, shade);
    px(x, y, SW, 1, C.night);
    px(x, y + 31, SW, 1, C.night);
    px(x, y, 1, MH, C.night);
    px(x + 39, y, 1, MH, C.night);
    px(x + 1, y + 28, SW - 2, 1, floor || "#b3c3c6");
    px(x + 1, y + 29, SW - 2, 2, "#6f8487");
    px(x + 1, y + 27, SW - 2, 1, C.night);
    px(x + 1, y + 16, 1, 11, "#4a2f1b");
    px(x + 38, y + 16, 1, 11, "#4a2f1b");
  }
  function drawNew(b: Room, x: number, y: number, t: number, dl: number) {
    switch (b.kind) {
      case "battery": {
        shell(x, y, "#2c4550", "#1e3540");
        for (let i = 0; i < 3; i++) {
          const bx = x + 5 + i * 11;
          px(bx, y + 8, 9, 19, C.night);
          px(bx + 1, y + 9, 7, 17, "#3b5a66");
          const f = stock.light / lightCap,
            h = Math.round(15 * f);
          px(bx + 2, y + 25 - h, 5, h, i % 2 ? C.cyan : C.sun);
          px(bx + 3, y + 6, 3, 2, C.copper);
        }
        if (spill > 0 && (frame >> 2) % 2)
          for (let i = 0; i < 3; i++) px(x + 4 + i * 12 + ((frame >> 1) % 8), y + 4, 1, 1, C.cream);
        break;
      }
      case "apiary": {
        shell(x, y, "#e9dcc0", "#d9cbae");
        for (let i = 0; i < 3; i++) {
          const hx = x + 5 + i * 12;
          px(hx, y + 12, 9, 14, "#d98b3a");
          px(hx, y + 11, 9, 1, C.night);
          for (let r = 0; r < 3; r++) px(hx, y + 15 + r * 4, 9, 1, "#a9662a");
          px(hx + 3, y + 23, 3, 2, C.night);
        }
        if (dl > 0.35)
          for (let i = 0; i < 6; i++) {
            const ph = t * (2 + i * 0.3) + i;
            px(
              x + 8 + ((i * 13) % 26) + Math.sin(ph) * 4,
              y + 6 + ((i * 5) % 8) + Math.cos(ph * 1.7) * 2,
              1,
              1,
              i % 2 ? C.sun : "#e29a2a",
            );
          }
        px(x + 3, y + 5, 10, 1, "#7a5a34");
        px(x + 4, y + 3, 2, 2, C.leaf);
        px(x + 9, y + 2, 3, 3, C.leafD);
        px(x + 10, y + 1, 1, 1, C.magenta);
        break;
      }
      case "loom": {
        shell(x, y, "#d9cbae", "#c7b797");
        px(x + 4, y + 8, 18, 18, "#8a5a34");
        px(x + 4, y + 7, 18, 1, C.night);
        for (let i = 0; i < 8; i++) px(x + 6 + i * 2, y + 10, 1, 14, i % 2 ? C.cream : "#b3c3c6");
        const sh = (frame >> 2) % 12;
        px(x + 5, y + 10 + sh, 16, 1, C.magenta);
        for (let i = 0; i < 4; i++) {
          px(x + 26 + i * 3, y + 4, 2, 9 + (i % 2) * 3, [C.magenta, C.cyan, C.sun, "#e0563f"][i]);
        }
        px(x + 25, y + 3, 13, 1, C.copper);
        px(x + 30, y + 20, 6, 6, "#e9dcc0");
        px(x + 30, y + 19, 6, 1, C.night);
        break;
      }
      case "cable": {
        shell(x, y, "#b3c3c6", "#8fa3a8");
        px(x + 18, y - 10, 4, 12, C.stoneD);
        px(x + 17, y - 11, 6, 1, C.night);
        px(x + 16, y - 9, 8, 2, C.copper);
        px(x + 8, y + 12, 24, 14, "#6f8487");
        px(x + 8, y + 11, 24, 1, C.night);
        px(x + 10, y + 14, 20, 8, "#2c4550");
        px(x + 12, y + 16, 16, 4, C.cyan);
        px(x + 19, y + 22, 2, 4, C.night);
        const w = (frame >> 3) % 2;
        px(x + 4, y + 6 + w, 3, 1, C.sun);
        px(x + 33, y + 7 - w, 3, 1, C.sun);
        break;
      }
      case "aviary": {
        shell(x, y, "#cdeff5", "#b8dce3");
        for (let i = 0; i < 9; i++) px(x + 3 + i * 4, y + 3, 1, 24, "rgba(196,109,59,0.6)");
        px(x + 3, y + 12, 34, 1, C.copper);
        px(x + 3, y + 20, 34, 1, C.copper);
        px(x + 8, y + 9, 4, 2, "#5a3a22");
        px(x + 26, y + 17, 4, 2, "#5a3a22");
        for (let i = 0; i < 4; i++) {
          const ph = t * (0.9 + i * 0.2) + i * 2;
          const bx = x + 20 + Math.cos(ph) * 14,
            by = y + 8 + ((i * 7) % 14) + Math.sin(ph * 2.3) * 3;
          px(bx, by, 2, 1, i % 2 ? C.magenta : C.cyan);
          px(bx + (Math.sin(ph * 8) > 0 ? -1 : 2), by - 1, 1, 1, i % 2 ? "#f2a5cb" : C.cream);
        }
        break;
      }
      case "foundry": {
        px(x, y, SW, MH, "#7a5a34");
        px(x + 3, y + 1, 34, 27, "#4a2f1b");
        px(x, y, SW, 1, C.night);
        px(x, y + 31, SW, 1, C.night);
        px(x, y, 1, MH, C.night);
        px(x + 39, y, 1, MH, C.night);
        px(x + 1, y + 28, 38, 3, "#6f8487");
        px(x + 1, y + 27, 38, 1, C.night);
        px(x + 8, y + 10, 22, 17, "#6f8487");
        px(x + 8, y + 9, 22, 1, C.night);
        px(x + 12, y + 14, 14, 8, "#3b2a18");
        const hot = (Math.sin(t * 3 + b.s) + 1) / 2;
        px(x + 13, y + 15, 12, 6, hot > 0.5 ? "#e0563f" : "#e29a2a");
        px(x + 16, y + 17, 6, 2, C.sun);
        px(x + 17, y + 3, 4, 7, C.stoneD);
        px(x + 16, y + 2, 6, 1, C.night);
        if (frame % 5 === 0)
          particles.push({
            x: x + 18 + rnd(0, 2),
            y: y + 2,
            vx: rnd(-2, 2),
            vy: -8,
            life: 0.5,
            c: "#c7d3d0",
            s: 1,
          });
        for (let i = 0; i < 3; i++)
          px(x + 31 + i * 2, y + 22 - (((frame >> 2) + i) % 4), 1, 1, C.sun);
        break;
      }
    }
  }
  function drawCap(b: Room, x: number, y: number, t: number, dl: number) {
    switch (b.kind) {
      case "mistnet": {
        px(x + 3, y + 14, 1, 18, C.copper);
        px(x + 36, y + 14, 1, 18, C.copper);
        px(x + 19, y + 8, 2, 24, C.copper);
        for (let r = 0; r < 5; r++) px(x + 4, y + 16 + r * 3, 32, 1, "rgba(205,239,245,0.55)");
        for (let c = 0; c < 8; c++) px(x + 6 + c * 4, y + 16, 1, 13, "rgba(205,239,245,0.4)");
        px(x + 10, y + 26, 20, 5, C.stoneD);
        px(x + 10, y + 25, 20, 1, C.night);
        if ((frame >> 2) % 3 === 0) px(x + 8 + ((frame >> 1) % 24), y + 29, 1, 1, "#7fd4e0");
        px(x + 18, y + 6, 4, 2, C.magenta);
        break;
      }
      case "belltower": {
        px(x + 12, y + 4, 16, 28, "#b3c3c6");
        px(x + 11, y + 3, 18, 1, C.night);
        px(x + 11, y + 3, 1, 29, C.night);
        px(x + 29, y + 3, 1, 29, C.night);
        px(x + 14, y + 10, 12, 10, C.night);
        const sw = Math.sin(t * 4) * (bell > 0 ? 2 : 0);
        px(x + 18 + sw, y + 12, 4, 5, C.sun);
        px(x + 19 + sw, y + 17, 2, 1, "#e29a2a");
        px(x + 19, y + 9, 2, 3, C.copper);
        px(x + 8, y + 2, 24, 2, C.copper);
        px(x + 18, y - 2, 4, 4, C.magenta);
        px(x + 16, y + 24, 8, 4, C.night);
        break;
      }
      case "pier": {
        px(x + 18, y + 2, 4, 30, C.stoneD);
        px(x + 17, y + 1, 6, 1, C.night);
        px(x + 2, y + 18, 36, 3, "#8a5a34");
        px(x + 2, y + 17, 36, 1, C.night);
        px(x + 4, y + 21, 2, 10, "#5a4326");
        px(x + 34, y + 21, 2, 10, "#5a4326");
        for (let i = 0; i < 5; i++) px(x + 4 + i * 8, y + 13, 1, 5, C.copper);
        px(x + 3, y + 13, 34, 1, C.copper);
        px(x + 18, y - 2, 4, 4, ship.active && ship.phase === 1 ? C.sun : C.magenta);
        px(x + 8, y + 15, 3, 1, (frame >> 3) & 1 ? C.sun : "#e29a2a");
        px(x + 30, y + 15, 3, 1, (frame >> 3) & 1 ? "#e29a2a" : C.sun);
        break;
      }
      case "observatory": {
        px(x + 6, y + 16, 28, 16, "#b3c3c6");
        px(x + 5, y + 15, 30, 1, C.night);
        px(x + 5, y + 15, 1, 17, C.night);
        px(x + 34, y + 15, 1, 17, C.night);
        for (let r = 0; r < 10; r++) {
          const w = Math.round(Math.sqrt(100 - (10 - r) * (10 - r)) * 1.4);
          px(x + 20 - w, y + 6 + r, w * 2, 1, r % 2 ? "#6f8487" : "#7b8f94");
        }
        px(x + 9, y + 7, 22, 1, C.night);
        px(x + 19, y + 4, 2, 8, dl < 0.3 ? C.cyan : "#2c4550");
        px(x + 22, y + 2, 3, 1, C.copper);
        px(x + 24, y + 1, 2, 1, C.copper);
        px(x + 12, y + 22, 6, 6, C.night);
        px(x + 24, y + 22, 4, 4, dl < 0.4 ? C.sun : "#2c4550");
        break;
      }
    }
  }
  function drawCottage(c: Pick<Cottage, "x" | "L" | "seed" | "age">, dl: number) {
    const x = c.x - 6,
      y = feetY(c.L),
      lit = dl < 0.55 || supper > 0;
    px(x, y - 7, 12, 7, "#e9dcc0");
    px(x, y - 7, 12, 1, C.night);
    px(x, y - 7, 1, 7, C.night);
    px(x + 11, y - 7, 1, 7, C.night);
    px(x, y, 12, 1, C.night);
    for (let r = 0; r < 4; r++)
      px(x - 1 + r, y - 8 - r, 14 - r * 2, 1, r % 2 ? "#2f7a44" : "#1e4a2b");
    px(x + 5, y - 12, 2, 1, C.leafL);
    px(x + 2, y - 5, 3, 5, "#4a2f1b");
    px(x + 3, y - 3, 1, 1, C.sun);
    px(x + 7, y - 5, 3, 3, lit ? C.sun : "#3b5a66");
    px(x + 8, y - 5, 1, 3, lit ? "#fff3c4" : "#3b5a66");
    px(x + 7, y - 4, 3, 1, C.night);
    px(x + 9, y - 10, 2, 3, "#6f8487");
    if (supper > 0 && (frame >> 3) % 2) px(x + 9, y - 12, 1, 1, "#c7d3d0");
    const v = Math.min(5, Math.floor(c.age / 60));
    for (let i = 0; i < v; i++) {
      const vx = x + 1 + (((c.seed * 11 + i * 5) % 10) | 0);
      px(vx, y - 9 - (i % 2), 1, 2 + (i % 3), C.leaf);
    }
    px(x - 2, y - 2, 1, 2, C.copper);
    px(x - 3, y - 3, 3, 1, ((frame >> 3) + c.x) % 3 ? C.sun : "#e29a2a");
  }
  function drawLife(
    x: number,
    top: number,
    bot: number,
    w: number,
    seed: number,
    t: number,
    dl: number,
    canopy: number,
  ) {
    const nv = Math.round((3 + w / 12) * (0.3 + canopy));
    for (let i = 0; i < nv; i++) {
      const vx = x + 4 + ((seed + i * 13) % (w - 8)),
        len = 6 + ((seed + i * 7) % 16);
      for (let j = 0; j < len; j++)
        px(
          vx + Math.round(Math.sin(j * 0.6 + i) * 0.6),
          top + 4 + j,
          1,
          1,
          j % 4 === 3 ? C.leafL : C.leafD,
        );
      if (i % 3 === 0) px(vx + 1, top + 4 + len - 1, 1, 1, [C.magenta, "#f2a5cb", C.sun][i % 3]);
    }
    for (let i = 0; i < Math.round(w / 14); i++) {
      const fx = x + 6 + ((seed + i * 17) % (w - 12)),
        fy = bot - 10;
      for (let k = 0; k < 4; k++) {
        px(fx - k, fy - k, 1, 1, C.leaf);
        px(fx + k, fy - k, 1, 1, C.leaf);
      }
      px(fx, fy - 4, 1, 1, C.leafL);
    }
    for (let i = 0; i < Math.round(w / 20); i++) {
      const mx = x + 10 + ((seed + i * 23) % (w - 16));
      px(mx, bot - 11, 1, 2, C.cream);
      px(mx - 1, bot - 12, 3, 1, i % 2 ? C.magenta : "#e29a2a");
    }
    for (let i = 0; i < Math.round(w / 8); i++)
      px(
        x + 3 + ((seed + i * 29) % (w - 6)),
        bot - 10 - ((seed + i) % 3),
        1,
        1,
        [C.magenta, C.sun, "#f2a5cb", C.cream, C.cyan][i % 5],
      );
    if (dl > 0.4)
      for (let i = 0; i < Math.round(w / 16); i++) {
        const ph = t * (1.5 + i * 0.2) + i * 3;
        const bx = x + 10 + ((seed + i * 31) % (w - 20)) + Math.sin(ph) * 5,
          by = top + 18 + ((i * 11) % (bot - top - 40)) + Math.sin(ph * 2.2) * 3;
        const wing = (frame >> 2) & 1;
        px(bx - wing, by, 1, 1, C.cyan);
        px(bx + 1 + wing, by, 1, 1, C.cyan);
        px(bx, by, 1, 1, C.cream);
      }
    if (dl < 0.35)
      for (let i = 0; i < Math.round(w / 10); i++) {
        const ph = t * (0.8 + i * 0.1) + i;
        if (((frame >> 3) + i) % 5 < 3)
          px(
            x + 6 + ((seed + i * 37) % (w - 12)) + Math.sin(ph) * 4,
            top + 20 + ((i * 13) % (bot - top - 40)) + Math.cos(ph * 1.3) * 3,
            1,
            1,
            C.sun,
          );
      }
  }
  function drawGrand(b: Room) {
    const x = b.s * SW,
      w = b.w * SW,
      top = modTop(b.L + b.h - 1),
      bot = modTop(b.L) + 32,
      h = bot - top,
      t = simTime,
      dl = daylightNow(),
      seed = b.seed * 100,
      tier = b.tier;
    px(x, top, w, h, "#1f3d3c");
    if (tier >= 2) {
      for (let r = 0; r < 12; r++) {
        const ww = Math.round((Math.sqrt(1 - Math.pow((12 - r) / 12, 2)) * w) / 2);
        px(x + w / 2 - ww, top - 12 + r, ww * 2, 1, r % 2 ? "#cdeff5" : "#b8dce3");
        px(x + w / 2 - ww, top - 12 + r, 1, 1, C.night);
        px(x + w / 2 + ww - 1, top - 12 + r, 1, 1, C.night);
      }
      for (let i = 1; i < b.w * 2; i++)
        px(x + i * (w / (b.w * 2)), top - 11, 1, 11, "rgba(196,109,59,0.7)");
      px(x + w / 2 - 1, top - 16, 2, 4, C.magenta);
    } else {
      px(x + 1, top + 1, w - 2, 3, "#cdeff5");
    }
    px(x, top, w, 1, C.night);
    px(x, bot - 1, w, 1, C.night);
    px(x, top, 1, h, C.night);
    px(x + w - 1, top, 1, h, C.night);
    px(x + 1, top + 1, 1, h - 2, C.copper);
    px(x + w - 2, top + 1, 1, h - 2, C.copper);
    for (let i = 1; i < b.w; i++) px(x + i * SW, top + 1, 1, h - 2, "rgba(196,109,59,0.45)");
    for (let yy = top + 8; yy < bot - 8; yy += 14) {
      px(x + 2, yy, 1, 1, "#cdeff5");
      px(x + w - 3, yy + 7, 1, 1, "#cdeff5");
    }
    if (dl > 0.4)
      for (let i = 0; i < b.w * 2; i++) {
        for (let k = 0; k < h - 14; k++)
          if ((k + i * 7) % 3 === 0)
            px(x + 8 + i * 19 + k * 0.25, top + 5 + k, 1, 1, "rgba(232,225,190,0.09)");
      }
    px(x + 1, bot - 9, w - 2, 8, "#5a4326");
    px(x + 1, bot - 9, w - 2, 1, "#7a5a34");
    // waterfall + pool (tier>=2)
    if (tier >= 2) {
      const wx = x + w - 14;
      for (let yy = top + 6; yy < bot - 12; yy++) {
        px(
          wx,
          yy,
          3,
          1,
          (yy + (frame >> 1)) % 5 ? "rgba(127,212,224,0.55)" : "rgba(205,239,245,0.9)",
        );
      }
      px(x + w - 22, bot - 12, 19, 4, "#2f8fa6");
      px(x + w - 22, bot - 12, 19, 1, "#7fd4e0");
      px(x + w - 24, bot - 13, 23, 1, C.night);
      for (let i = 0; i < 3; i++) px(x + w - 20 + i * 6, bot - 13, 3, 1, C.leafL);
      if (frame % 4 === 0)
        particles.push({
          x: wx + 1,
          y: bot - 13,
          vx: rnd(-10, 10),
          vy: rnd(-14, -4),
          life: 0.3,
          c: "rgba(205,239,245,0.8)",
          s: 1,
        });
    }
    // understory
    const under = Math.round(b.plants / 5);
    for (let i = 0; i < under; i++) {
      const fx = x + 3 + ((seed + i * 13) % (w - 6)),
        fh = 2 + ((seed + i * 7) % 6);
      px(fx, bot - 9 - fh, 1, fh, b.plants < 25 ? "#7a6b34" : C.leaf);
      px(fx + 1, bot - 9 - fh + 1, 1, 1, C.leafL);
    }
    // terraces: walkways at each level with railings and planters; hanging vines (tier>=2)
    for (let L = 1; L < b.h; L++) {
      const wy = modTop(b.L + L) + 29;
      const left = L % 2 === 1;
      const wl = Math.round(w * 0.55);
      const wx0 = left ? x + 1 : x + w - 1 - wl;
      px(wx0, wy, wl, 1, "#8a5a34");
      px(wx0, wy + 1, wl, 1, C.night);
      for (let i = 0; i < wl; i += 8) px(wx0 + i, wy - 6, 1, 6, C.copper);
      px(wx0, wy - 6, wl, 1, C.copper);
      for (let i = 4; i < wl - 4; i += 12) {
        px(wx0 + i, wy - 3, 6, 3, "#7a5a34");
        px(wx0 + i + 1, wy - 6, 1, 3, C.leaf);
        px(wx0 + i + 4, wy - 5, 1, 2, C.leafL);
      }
      if (tier >= 2)
        for (let i = 2; i < wl; i += 9) {
          const len = 4 + ((seed + i + L * 3) % 9);
          px(wx0 + i, wy + 2, 1, len, C.leafD);
          px(wx0 + i + 1, wy + 1 + len, 1, 1, C.leafL);
        }
      if (tier >= 3)
        for (let i = 6; i < wl; i += 16) {
          px(wx0 + i, wy - 9, 1, 3, C.night);
          px(wx0 + i - 1, wy - 6, 3, 2, ((frame >> 3) + i + L) % 5 ? C.sun : "#e29a2a");
        }
    }
    // great tree + cedars
    for (let ci = 0; ci < b.cedars.length; ci++) {
      const c = b.cedars[ci],
        great = ci === Math.floor(b.cedars.length / 2),
        cx = x + Math.round(c.x),
        ch = Math.round(8 + c.h * (h - (great ? 20 : 30))),
        tw = great ? 4 : 2;
      px(cx - Math.floor(tw / 2), bot - 9 - ch, tw, ch, "#5a3a22");
      px(cx - Math.floor(tw / 2), bot - 9 - ch, 1, ch, "#7a5a34");
      px(cx - tw, bot - 10, tw * 2 + 1, 1, "#5a3a22");
      if (great) {
        const tiers = 3 + Math.floor(c.h * 6);
        for (let tI = 0; tI < tiers; tI++) {
          const ty = Math.round(bot - 9 - ch + 4 + tI * ((ch - 8) / tiers)),
            ww = Math.min(26, 8 + tI * 3);
          px(cx - Math.floor(ww / 2), ty, ww, 3, tI % 2 ? "#1e4a2b" : "#2f7a44");
          px(cx - Math.floor(ww / 2) + 2, ty - 1, ww - 4, 1, "#357f4e");
          if (tI % 2)
            px(
              cx - Math.floor(ww / 2) + 3 + ((tI * 5) % (ww - 6)),
              ty + 1,
              1,
              1,
              [C.magenta, C.sun, "#f2a5cb"][tI % 3],
            );
        }
        px(cx - 3, bot - 9 - ch - 4, 6, 4, "#357f4e");
        px(cx - 1, bot - 9 - ch - 6, 2, 2, C.leafL);
      } else {
        const tiers = 2 + Math.floor(c.h * 6),
          gap = Math.max(4, (ch - 8) / tiers);
        for (let tI = 0; tI < tiers; tI++) {
          const ty = Math.round(bot - 9 - ch + 3 + tI * gap),
            ww = Math.min(11, 3 + Math.round(tI * 1.3));
          px(cx - Math.floor(ww / 2), ty, ww, 2, c.seed > 0.5 ? "#1e4a2b" : "#24573a");
          px(cx - Math.floor(ww / 2) + 1, ty - 1, ww - 2, 1, "#2f7a44");
        }
        px(cx - 1, bot - 9 - ch - 3, 2, 3, "#2f7a44");
      }
    }
    // creatures
    const K = Math.min;
    const mc = K(14, Math.round(b.moth));
    for (let i = 0; i < mc; i++) {
      const ph = t * (1.1 + i * 0.13) + i;
      px(
        x + 8 + ((seed + i * 17) % (w - 16)) + Math.sin(ph * 2) * 3,
        top + 14 + ((i * 9) % (h - 30)) + Math.cos(ph * 3) * 2,
        1,
        1,
        C.sun,
      );
    }
    const nc = K(12, Math.round(b.finch));
    for (let i = 0; i < nc; i++) {
      const ph = t * (0.7 + i * 0.12) + i * 2;
      const bx = x + w / 2 + Math.cos(ph * 0.8 + i) * (w / 2 - 10),
        by = top + 16 + ((i * 13) % (h * 0.5)) + Math.sin(ph * 1.6) * 5;
      px(bx, by, 2, 1, C.magenta);
      px(bx + (Math.sin(ph * 7) > 0 ? -1 : 2), by - 1, 1, 1, "#f2a5cb");
    }
    const fc = K(8, Math.round(b.frog));
    for (let i = 0; i < fc; i++) {
      const ph = t * (1.0 + i * 0.2) + i * 3;
      const hop = Math.abs(Math.sin(ph * 1.5)),
        fxp = x + 5 + ((seed + i * 19 + Math.floor(ph / 6) * 5) % (w - 10));
      px(fxp, bot - 11 - hop * 5, 2, 2, C.leafL);
    }
    const hc = K(5, Math.round(b.heron));
    for (let i = 0; i < hc; i++) {
      const c = b.cedars[(i * 2) % b.cedars.length],
        hx = x + Math.round(c.x) + 1,
        hy = bot - 9 - Math.round(8 + c.h * (h - 30)) + 6 + i * 3;
      px(hx + 3, hy - 7, 1, 7, C.cyan);
      px(hx + 2, hy - 9, 3, 2, C.cyan);
      px(hx + 5, hy - 9, 2, 1, C.sun);
    }
    const gc = K(6, Math.round(b.goat));
    for (let i = 0; i < gc; i++) {
      const ph = t * 0.5 + i * 4;
      const gx = x + 6 + ((seed + i * 23 + Math.floor(ph / 8) * 7) % (w - 14)),
        step = (frame >> 4) & 1;
      px(gx, bot - 12, 5, 3, "#e9dcc0");
      px(gx + 4, bot - 14, 2, 2, "#e9dcc0");
      px(gx + 1, bot - 9, 1, 1 + step, "#7a6b34");
      px(gx + 3, bot - 9, 1, 2 - step, "#7a6b34");
    }
    drawLife(x, top, bot, w, seed, t, dl, b.canopy || 0);
    {
      const c = b.cedars[Math.floor(b.cedars.length / 2)];
      const cx = x + Math.round(c.x),
        ch = Math.round(8 + c.h * (h - 20));
      const sq = bot - 12 - Math.abs(Math.sin(t * 0.9 + seed)) * Math.min(ch - 6, 40);
      px(cx + 2, sq, 3, 2, "#8a5a34");
      px(cx + 4, sq - 1, 1, 1, "#8a5a34");
      px(cx + 1, sq - 1, 1, 2, "#a17a4a");
      if (dl < 0.35) {
        const oy = bot - 9 - ch + Math.round((ch - 8) * 0.35);
        px(cx - 6, oy, 3, 4, "#3b2a18");
        px(cx - 6, oy + 1, 1, 1, (frame >> 4) & 1 ? C.sun : "#3b2a18");
        px(cx - 4, oy + 1, 1, 1, (frame >> 4) & 1 ? C.sun : "#3b2a18");
      }
    }
    if (tier >= 2)
      for (let i = 0; i < 3; i++) {
        const ph = t * (2 + i * 0.4) + i * 2;
        const dx = x + w - 18 + Math.sin(ph * 1.7) * 6,
          dy = bot - 22 - ((i * 9) % 18) + Math.cos(ph * 2.5) * 4;
        px(dx, dy, 3, 1, C.cyan);
        px(dx + 1, dy - 1, 1, 1, "#cdeff5");
      }
    for (const c of b.cottages || []) drawCottage(c, dl);
    if (b.water < 0.3) px(x + w - 8, top + 6, 3, 3, "#e0563f");
  }
  function drawRoom(b: Room) {
    if (
      b.kind === "atriumpart" ||
      b.kind === "lagoonpart" ||
      b.kind === "hallpart" ||
      b.kind === "grandpart"
    )
      return;
    if (b.kind === "grand") {
      drawGrand(b);
      return;
    }
    if (["battery", "apiary", "loom", "cable", "aviary", "foundry"].includes(b.kind)) {
      drawNew(b, b.s * SW, modTop(b.L), simTime, daylightNow());
      return;
    }
    if (["mistnet", "belltower", "pier", "observatory"].includes(b.kind)) {
      drawCap(b, b.s * SW, modTop(b.L), simTime, daylightNow());
      return;
    }
    if (b.kind === "hall") {
      drawHall(b);
      return;
    }
    if (b.kind === "atrium") {
      drawAtrium(b);
      return;
    }
    if (b.kind === "lagoon") {
      drawLagoon(b);
      return;
    }
    const x = b.s * SW,
      y = modTop(b.L),
      t = simTime,
      daylight = daylightNow();
    spr(b.kind, x, y + capOffset(b.kind));
    if (daylight < 0.55 && blackout <= 0 && b.L > 0 && !BLD[b.kind].cap && !BLD[b.kind].bridge) {
      const nc =
        b.kind === "market" || b.kind === "bath"
          ? C.magenta
          : b.kind === "library"
            ? "#b18cff"
            : (b.s + b.L) % 3 === 0
              ? C.magenta
              : C.cyan;
      const fl = ((frame >> 2) + b.s * 3 + b.L) % 29 === 0;
      if (!fl) {
        px(x + 2, y + 1, SW - 4, 1, nc);
      }
      px(x + 1, y + 29, 1, 1, nc);
      px(x + 38, y + 29, 1, 1, nc);
    }
    switch (b.kind) {
      case "garden": {
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < 2; i++) {
            const rx = x + 3 + i * 18,
              ry = y + 13 + r * 4;
            if (b.water < 0.35) px(rx + 1, ry + 3, 13, 1, "#8a6a44");
            const slot = r * 2 + i;
            if (slot < b.amt) {
              px(rx + 2, ry + 1, 1, 1, [C.magenta, C.sun, "#e0563f"][slot % 3]);
              px(rx + 7, ry + 1, 1, 1, C.sun);
              px(rx + 11, ry + 1, 1, 1, C.magenta);
            }
          }
        if (b.water < 0.35) px(x + 35, y + 4, 3, 3, "#e0563f");
        else if (flow.gardens > 0 && (frame >> 2) % 3 === 0)
          px(x + 3 + ((frame >> 1) % 34), y + 2, 1, 1, C.water);
        break;
      }
      case "home": {
        const v = Math.min(8, Math.floor(b.age / 80)) + b.vines;
        for (let i = 0; i < v; i++) {
          const vx = x + 2 + Math.floor((b.seed * 13 + i * 5.3) % 35),
            len = 2 + ((i * 7 + b.s) % 6);
          px(vx, y + 1, 1, len, C.leaf);
          px(vx + 1, y + len - 1, 1, 1, C.leafL);
        }
        if (daylight < 0.45) {
          px(x + 15, y + 7, 6, 5, C.sun);
          px(x + 19, y + 20, 1, 1, C.sun);
        }
        if (b.mural) {
          const pal = [
            [C.cyan, C.waterD, C.cream],
            [C.leaf, C.leafL, C.sun],
            [C.cyan, C.cream, C.sun],
            [C.stoneD, C.copper, C.cream],
            [C.water, C.cyan, "#9fd8e8"],
            [C.copper, C.sun, C.rockD],
          ][
            ["the tide", "the grove", "a heron", "the old world", "rain", "the mine"].indexOf(
              b.mural.theme,
            )
          ] || [C.magenta, C.sun, C.cyan];
          for (let i = 0; i < 40; i++) {
            const mx = x + 24 + (i % 8),
              my = y + 5 + Math.floor(i / 8);
            const v =
              Math.sin(b.mural.seed * 40 + i * 1.7 + mx * 0.3) +
              Math.cos(my * 0.9 + b.mural.seed * 9);
            if (v > 0.3) px(mx, my, 1, 1, v > 1.1 ? pal[2] : pal[1]);
            else if (v < -0.6) px(mx, my, 1, 1, pal[0]);
          }
          px(x + 23, y + 4, 10, 1, C.copper);
          px(x + 23, y + 10, 10, 1, C.copper);
        }
        if (b.glowvine) {
          for (let i = 0; i < 6; i++) {
            const vx = x + 3 + i * 6,
              len = 4 + ((i * 5) % 7);
            px(vx, y + 1, 1, len, "#2f7a44");
            if (((frame >> 3) + i) % 3) px(vx, y + len, 1, 1, C.cyan);
          }
        }
        break;
      }
      case "solar": {
        if (daylight > 0.5 && Math.sin(t * 5 + b.s + b.L) > 0.9)
          px(x + 2 + rint(0, 35), y + 1 + rint(0, 3), 1, 1, C.cream);
        break;
      }
      case "wind": {
        const cx = x + 20,
          cy = y + 12,
          ang = t * (2 + b.L * 0.15) + b.s;
        for (let i = 0; i < 3; i++) {
          const a = ang + (i * Math.PI * 2) / 3;
          for (let r = 1; r <= 6; r++)
            px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, r > 4 ? C.cream : C.cyan);
        }
        px(cx - 1, cy - 1, 2, 2, C.magenta);
        break;
      }
      case "tank": {
        const f = stock.water / waterCap,
          hgt = Math.round(20 * f);
        px(x + 10, y + 26 - hgt, 20, hgt, C.waterD);
        if (hgt > 0) px(x + 10, y + 26 - hgt, 20, 1, C.water);
        if (f > 0.05 && Math.sin(t * 3 + b.L) > 0.5)
          px(x + 12 + ((frame >> 2) % 16), y + 26 - hgt - 1, 1, 1, C.cream);
        break;
      }
      case "turbine": {
        const cx = x + 20,
          cy = y + 14,
          spin = flow.turbine > 0;
        const ang = spin ? t * 4 + b.s : b.s;
        for (let i = 0; i < 4; i++) {
          const a = ang + (i * Math.PI) / 2;
          for (let r = 1; r <= 7; r++)
            px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, r > 5 ? C.cream : C.stone);
        }
        px(cx - 1, cy - 1, 2, 2, C.magenta);
        if (spin)
          for (let i = 0; i < 3; i++)
            px(x + 2 + ((frame * 2 + i * 12 + b.s * 5) % 36), y + 25, 1, 1, C.cream);
        break;
      }
      case "bath": {
        if (Math.sin(t * 2 + b.s) > 0)
          px(x + 12 + (Math.floor(t * 6) % 14), y + 17, 1, 2, "#c7d3d0");
        if (Math.sin(t * 3 + b.L) > 0.2)
          px(x + 26 - (Math.floor(t * 4) % 9), y + 16, 1, 1, "#c7d3d0");
        break;
      }
      case "workshop": {
        if (Math.sin(t * 7 + b.s) > 0.7) px(x + 7 + rint(0, 3), y + 20, 1, 1, C.sun);
        break;
      }
      case "market": {
        const f = (frame >> 3) & 1;
        px(x + 9, y + 5, 1, 2, f ? C.sun : "#e29a2a");
        px(x + 21, y + 4, 1, 2, f ? C.magenta : "#f2a5cb");
        px(x + 33, y + 6, 1, 2, f ? C.sun : "#e29a2a");
        if ((frame >> 4) % 3) px(x + 14, y + 3, 12, 1, "#f2a5cb");
        break;
      }
      case "library": {
        if (daylight < 0.45) {
          px(x + 6, y + 7, 1, 2, C.sun);
          px(x + 33, y + 7, 1, 2, C.sun);
        }
        break;
      }
      case "lift":
      case "mineshaft": {
        const isLift = b.kind === "lift";
        const lo = isLift ? b.L : b.L - 1,
          hi = isLift ? b.L + 1 : b.L;
        const riders = agents.filter(
          (a) =>
            a.s === b.s &&
            a.climbing === (isLift ? 2 : 3) &&
            a.py <= feetY(lo) + 2 &&
            a.py >= feetY(hi) - 2,
        );
        const cy = riders.length ? riders[0].py : feetY(isLift ? b.L : b.L);
        if (isLift) {
          px(x + 7, cy - 22, 26, 1, C.night);
          px(x + 7, cy - 22, 1, 23, C.night);
          px(x + 32, cy - 22, 1, 23, C.night);
          px(x + 8, cy - 21, 24, 2, C.copper);
          px(x + 8, cy, 24, 1, C.copper);
          px(x + 18, cy - 22, 4, 1, C.sun);
        } else {
          px(x + 14, cy - 20, 12, 1, C.copper);
          px(x + 14, cy - 20, 1, 21, C.copper);
          px(x + 25, cy - 20, 1, 21, C.copper);
          px(x + 14, cy, 12, 1, C.copper);
          px(x + 19, y + 1, 1, Math.max(0, cy - 20 - y - 1), C.stone);
        }
        if (riders.length)
          for (let i = 0; i < 2; i++) px(x + 19 + i, cy - 26 - ((frame >> 2) % 3), 1, 1, C.cyan);
        break;
      }
      case "bridge": {
        for (let i = 0; i < 3; i++) {
          const vx = x + 3 + i * 6 + (Math.floor(b.age / 60) % 3);
          px(vx, y + 32, 1, 4 + ((i * 3) % 5), C.leaf);
        }
        break;
      }
      case "beacon": {
        if (Math.sin(t * 3) > 0) px(x + 19, y - 8, 2, 2, C.cream);
        break;
      }
      case "catcher": {
        const f = stock.water / waterCap;
        px(x + 13, y + 4 + 19 + 5 - Math.round(5 * f), 14, Math.round(5 * f), C.waterD);
        if (rainNow)
          for (let i = 0; i < 3; i++)
            px(x + 6 + ((frame * 3 + i * 11) % 28), y + 5 + ((frame + i * 7) % 8), 1, 2, C.water);
        if (flow.inflow > 0) px(x + 34, y + 4 + 22 + ((frame >> 1) % 5), 1, 1, C.water);
        break;
      }
      case "dome": {
        for (let i = 0; i < b.amt; i++)
          px(
            x + 15 + i * 2,
            y + 2 + 11 + (i % 2) * 3,
            1,
            1,
            [C.magenta, C.sun, "#e0563f", C.cream, C.cyan][i],
          );
        if (daylight > 0.5 && Math.sin(t * 4 + b.s) > 0.92)
          px(x + 4 + rint(0, 30), y + 2 + rint(2, 12), 1, 1, C.cream);
        break;
      }
      case "marsh": {
        const seed = (b.L * 7 + b.s) * 13;
        spr("wild", x, y);
        px(x + 1, y, 38, 1, "#22403f");
        px(x + 1, y + 1, 38, 1, C.copper);
        const lv = Math.round(9 * Math.min(1, b.level));
        px(x + 2, y + 22 - lv, 36, lv, "rgba(47,143,166,0.8)");
        if (lv > 0) px(x + 2, y + 22 - lv, 36, 1, "#7fd4e0");
        const rc = Math.round(b.plants / 7);
        for (let i = 0; i < rc; i++) {
          const rx = x + 4 + ((seed + i * 9) % 32),
            rh = 6 + ((seed + i * 5) % 9);
          px(rx, y + 22 - rh, 1, rh, i % 2 ? "#2f7a44" : "#6fbf73");
          px(rx, y + 22 - rh - 2, 1, 2, "#7a5a34");
        }
        if (b.level > 0.5)
          for (let i = 0; i < 3; i++)
            px(x + 8 + ((seed + i * 13) % 26), y + 22 - lv, 3, 1, "#6fbf73");
        if (rainNow)
          for (let i = 0; i < 4; i++)
            px(
              x + 4 + ((frame * 3 + i * 11) % 32),
              y + 3 + ((frame + i * 7) % 9),
              1,
              2,
              "rgba(140,215,225,0.7)",
            );
        if (b.channel) {
          px(x + 36, y + 22, 2, 10, C.copper);
          px(x + 37, y + 24 + ((frame >> 1) % 7), 1, 1, "#7fd4e0");
        }
        const mc = Math.min(6, Math.round(b.moth));
        for (let i = 0; i < mc; i++) {
          const ph = t * (1.2 + i * 0.17) + i * 2 + b.L;
          const mx = x + 6 + ((seed + i * 13) % 28) + Math.sin(ph * 2) * 3,
            my = y + 6 + ((i * 5) % 7) + Math.cos(ph * 3) * 2;
          px(mx, my, 1, 1, C.sun);
        }
        const fc = Math.min(6, Math.round(b.frog));
        for (let i = 0; i < fc; i++) {
          const ph = t * (1.0 + i * 0.2) + i * 3;
          const hop = Math.abs(Math.sin(ph * 1.5)),
            fxp = x + 5 + ((seed + i * 17 + Math.floor(ph / 6) * 5) % 30);
          px(fxp, y + 21 - lv - hop * 4, 2, 2, C.leafL);
          px(fxp + 1, y + 20 - lv - hop * 4, 1, 1, C.night);
        }
        const hc = Math.min(2, Math.round(b.heron));
        for (let i = 0; i < hc; i++) {
          const hx = x + 30 - i * 10,
            hy = y + 22;
          px(hx, hy - 8, 1, 8, C.cyan);
          px(hx - 1, hy - 10, 3, 2, C.cyan);
          px(hx + 2, hy - 10, 2, 1, C.sun);
        }
        const nc = Math.min(3, Math.round(b.finch));
        for (let i = 0; i < nc; i++) {
          const ph = t * (0.8 + i * 0.15) + i * 2;
          px(x + 20 + Math.cos(ph * 0.8 + i) * 13, y + 6 + Math.sin(ph * 1.6) * 3, 2, 1, C.magenta);
        }
        if (b.level < 0.35) px(x + 35, y + 4, 3, 3, "#e0563f");
        break;
      }
      case "wild": {
        const P_ = b.plants,
          seed = (b.L * 7 + b.s) * 13;
        const n = Math.round(P_ / 8);
        if (b.L > 1 && !M(b.s, b.L - 1)) {
          px(x + 2, y + 32, 1, 6, C.copper);
          px(x + 37, y + 32, 1, 6, C.copper);
          for (let i = 0; i < 6; i++) {
            px(x + 2 + i, y + 37 - i, 1, 1, C.copper);
            px(x + 37 - i, y + 37 - i, 1, 1, C.copper);
          }
        }
        for (let i = 0; i < n; i++) {
          const fx = x + 4 + ((seed + i * 11) % 31),
            h = 3 + ((seed + i * 5) % 9) + (P_ > 60 ? 3 : 0);
          px(fx, y + 22 - h, 1, h, P_ < 25 ? "#7a6b34" : C.leaf);
          px(fx - 1, y + 22 - h + 1, 1, 1, C.leafL);
          px(fx + 1, y + 22 - h + 2, 1, 1, C.leafD);
          if (i % 3 === 0) px(fx + 1, y + 22 - h - 1, 2, 1, C.leafL);
        }
        if (P_ > 55) {
          for (let i = 0; i < 6; i++) {
            const vx = x + 3 + ((seed + i * 7) % 34),
              len = 2 + ((seed + i * 3) % 6) + (P_ > 80 ? 3 : 0);
            px(vx, y + 2, 1, len, C.leafD);
            px(vx + 1, y + 2 + len - 1, 1, 1, C.leaf);
          }
        }
        if (P_ > 72) {
          for (let i = 0; i < 4; i++)
            px(
              x + 6 + ((seed + i * 9) % 28),
              y + 10 + ((seed + i * 5) % 9),
              1,
              1,
              [C.magenta, C.sun, "#f2a5cb", C.cream][i],
            );
        }
        if (b.fert > 0.6) for (let i = 0; i < 3; i++) px(x + 8 + i * 11, y + 23, 2, 1, "#3b2a18");
        if (b.water < 0.3) px(x + 35, y + 4, 3, 3, "#e0563f");
        if (P_ < 20) for (let i = 0; i < 5; i++) px(x + 5 + i * 7, y + 21, 2, 1, "#7a6b34");
        // ports and tubes to linked pods
        const rt = M(b.s + 1, b.L);
        if (rt && rt.kind === "wild") {
          px(x + 37, y + 12, 4, 7, "#cdeff5");
          px(x + 37, y + 11, 4, 1, C.copper);
          px(x + 37, y + 19, 4, 1, C.copper);
        }
        const up = M(b.s, b.L + 1);
        if (up && up.kind === "wild") {
          px(x + 34, y - 3, 4, 8, "#cdeff5");
          px(x + 33, y - 3, 1, 8, C.copper);
          px(x + 38, y - 3, 1, 8, C.copper);
          const dot = (frame * 0.7 + b.L * 9) % 8;
          px(x + 35, y - 3 + dot, 2, 1, C.sun);
        }
        const mc = Math.min(6, Math.round(b.moth));
        for (let i = 0; i < mc; i++) {
          const ph = t * (1.2 + i * 0.17) + i * 2 + b.L;
          const mx = x + 6 + ((seed + i * 13) % 28) + Math.sin(ph * 2) * 3,
            my = y + 8 + ((i * 5) % 8) + Math.cos(ph * 3) * 2;
          px(mx, my, 1, 1, C.sun);
          px(mx + (Math.sin(ph * 9) > 0 ? 1 : -1), my, 1, 1, "#e29a2a");
        }
        const fc = Math.min(4, Math.round(b.frog));
        for (let i = 0; i < fc; i++) {
          const ph = t * (1.0 + i * 0.2) + i * 3;
          const hop = Math.abs(Math.sin(ph * 1.5)),
            fxp = x + 5 + ((seed + i * 17 + Math.floor(ph / 6) * 5) % 30);
          px(fxp, y + 20 - hop * 5, 2, 2, C.leafL);
          px(fxp + 1, y + 19 - hop * 5, 1, 1, C.night);
        }
        const nc = Math.min(4, Math.round(b.finch));
        for (let i = 0; i < nc; i++) {
          const ph = t * (0.8 + i * 0.15) + i * 2;
          const bx = x + 20 + Math.cos(ph * 0.8 + i) * 13,
            by = y + 7 + Math.sin(ph * 1.6) * 4;
          px(bx, by, 2, 1, C.magenta);
          px(bx + (Math.sin(ph * 7) > 0 ? -1 : 2), by - 1, 1, 1, "#f2a5cb");
        }
        const hc = Math.min(2, Math.round(b.heron));
        for (let i = 0; i < hc; i++) {
          const hx = x + 30 - i * 8,
            hy = y + 21;
          px(hx, hy - 7, 1, 7, C.cyan);
          px(hx - 1, hy - 9, 3, 2, C.cyan);
          px(hx + 2, hy - 9, 2, 1, C.sun);
          if ((frame >> 4) & 1) px(hx, hy - 1, 1, 1, C.night);
        }
        const gc = Math.min(3, Math.round(b.goat));
        for (let i = 0; i < gc; i++) {
          const ph = t * 0.5 + i * 4;
          const gx = x + 8 + ((seed + i * 15 + Math.floor(ph / 8) * 7) % 26),
            step = (frame >> 4) & 1;
          px(gx, y + 18, 5, 3, "#e9dcc0");
          px(gx + 4, y + 16, 2, 2, "#e9dcc0");
          px(gx + 5, y + 15, 1, 1, C.night);
          px(gx + 1, y + 21, 1, 1 + step, "#7a6b34");
          px(gx + 3, y + 21, 1, 2 - step, "#7a6b34");
        }
        break;
      }
      case "gallery": {
        if (b.find) drawFind(b, x, y);
        for (let i = 0; i < Math.min(9, b.amt); i++) {
          const vx = x + 5 + ((i * 11) % 30),
            vy = y + 6 + ((i * 7) % 14);
          px(vx, vy, 1, 1, C.sun);
        }
        if (Math.sin(t * 3 + b.s) > 0.6) px(x + 24, y + 6, 1, 1, C.cream);
        break;
      }
      case "cave": {
        if (b.find) drawFind(b, x, y);
        for (let i = 0; i < b.amt; i++) px(x + 6 + i * 8, y + 22, 1, 1, C.cream);
        for (let i = 0; i < 5; i++) {
          const gx = x + 6 + ((i * 7) % 30),
            gy = y + 3 + ((i * 3) % 4);
          if (Math.sin(t * 2 + i + b.L) > 0.4) px(gx, gy, 1, 1, C.cyan);
        }
        break;
      }
      case "pump": {
        const ph = (frame >> 3) % 4;
        px(x + 10, y + 3 + ph, 2, 2, C.cyan);
        px(x + 29, y + 22 - ((frame >> 2) % 10), 1, 1, C.water);
        px(x + 9, y + 22 - ((frame >> 2) % 10), 1, 1, C.water);
        break;
      }
      case "geo": {
        const p = (Math.sin(t * 2 + b.s) + 1) / 2;
        px(x + 16, y + 13, 8, 1, p > 0.5 ? C.sun : "#e0563f");
        px(x + 19, y + 2 + ((frame >> 3) % 6), 2, 1, "#e0563f");
        break;
      }
    }
  }
  function drawSpine(s: number) {
    // pipes and conduits along a tower
    const h = heightOf(s);
    if (h < 1 || wildSlots.includes(s)) return;
    const x = s * SW,
      top = modTop(h),
      flowing = flow.inflow > 0 || flow.gardens + flow.turbine > 0;
    px(x + 38, top - 2, 1, SY - top, C.copper);
    px(x + 1, top - 2, 1, SY - top, "#5a6b73");
    if (flowing)
      for (let i = 0; i < 3; i++) {
        const y = top + ((simTime * 40 + (i * (SY - top)) / 3 + s * 13) % (SY - top));
        px(x + 38, y, 1, 2, C.water);
      }
    if (stock.light > 1)
      for (let L = 1; L <= h; L++) {
        if (((frame >> 3) + s + L) % 5 === 0) px(x + 1, modTop(L) + 3, 1, 2, C.cyan);
      }
    const d = depthOf(s);
    if (d > 0) {
      px(x + 38, SY + 8, 1, modTop(-d) + 32 - SY - 8, C.copper);
    }
  }
  function drawFind(b: Room, x: number, y: number) {
    const t = simTime;
    if (b.find === "geode") {
      for (let i = 0; i < 6; i++) {
        const gx = x + 22 + i * 2,
          gh = 3 + ((i * 3) % 5);
        px(gx, y + 27 - gh, 1, gh, i % 2 ? "#b18cff" : "#8a5fe0");
        px(gx, y + 27 - gh, 1, 1, Math.sin(t * 3 + i) > 0.5 ? C.cream : "#d9c8ff");
      }
    }
    if (b.find === "spring") {
      px(x + 5, y + 19, 10, 8, "#2f8fa6");
      px(x + 5, y + 19, 10, 1, "#7fd4e0");
      px(x + 8 + ((frame >> 2) % 4), y + 17 - ((frame >> 2) % 3), 1, 1, "#7fd4e0");
    }
    if (b.find === "relic") {
      px(x + 24, y + 14, 12, 13, C.stoneD);
      px(x + 24, y + 13, 12, 1, C.night);
      px(x + 26, y + 17, 3, 3, (frame >> 4) & 1 ? C.cyan : "#2a7f8e");
      px(x + 31, y + 17, 3, 3, (frame >> 4) & 1 ? "#2a7f8e" : C.magenta);
      px(x + 25, y + 23, 10, 1, C.copper);
    }
    if (b.find === "fossil") {
      px(x + 6, y + 21, 26, 1, C.cream);
      for (let i = 0; i < 6; i++) px(x + 8 + i * 4, y + 17, 1, 4, C.cream);
      px(x + 30, y + 18, 5, 4, C.cream);
      px(x + 32, y + 19, 1, 1, C.night);
    }
  }
  function drawRoof(s: number, L: number) {
    const x = s * SW,
      y = modTop(L) - 1,
      m = M(s, L);
    if (
      !m ||
      BLD[m.kind].cap ||
      BLD[m.kind].bridge ||
      BLD[m.kind].atrium ||
      BLD[m.kind].lagoon ||
      BLD[m.kind].grand ||
      m.kind === "atriumpart" ||
      m.kind === "lagoonpart" ||
      m.kind === "grandpart"
    )
      return;
    if (m.kind === "hall" || m.kind === "hallpart") {
      px(x, y - 1, SW, 2, C.night);
      px(x + 1, y - 2, SW - 2, 1, C.stoneD);
      for (let i = 0; i < 4; i++) {
        px(x + 6 + i * 9, y - 6, 2, 4, C.leaf);
        px(x + 6 + i * 9, y - 7, 2, 1, C.leafL);
      }
      px(x + 4, y - 3, 32, 1, "#7a5a34");
      return;
    }
    px(x, y - 1, SW, 2, C.night);
    px(x + 1, y - 2, SW - 2, 1, C.stoneD);
    const v = (s * 7 + L * 3) % 4;
    if (v === 0) {
      px(x + 4, y - 5, 10, 3, "#7a5a34");
      px(x + 4, y - 6, 10, 1, C.night);
      px(x + 5, y - 9, 2, 3, C.leaf);
      px(x + 9, y - 8, 2, 2, C.leafL);
      px(x + 11, y - 9, 1, 3, C.leaf);
    }
    if (v === 1) {
      px(x + 30, y - 9, 1, 7, C.stoneD);
      px(x + 27, y - 9, 7, 1, C.night);
      px(x + 30, y - 11, 1, 2, C.magenta);
    }
    if (v === 2) {
      px(x + 26, y - 8, 10, 6, C.stone);
      px(x + 26, y - 9, 10, 1, C.night);
      px(x + 27, y - 3, 1, 1, C.night);
      px(x + 34, y - 3, 1, 1, C.night);
      px(x + 29, y - 6, 4, 2, C.water);
    }
    if (v === 3) {
      for (let i = 0; i < 4; i++) {
        px(x + 6 + i * 8, y - 6, 2, 4, C.leaf);
        px(x + 6 + i * 8, y - 7, 2, 1, C.leafL);
      }
      px(x + 4, y - 3, 32, 1, "#7a5a34");
    }
  }
  function drawScaffold(p: Project) {
    if (p.kind === "cottage") {
      if (!p.host) return;
      const x = p.host.s * SW + p.cx,
        y = feetY(p.L);
      for (let i = 0; i < 3; i++) px(x + i * 5, y - 10, 1, 10, "#8a5a34");
      px(x, y - 6, 12, 1, "#8a5a34");
      if (p.funded) {
        const hh = Math.round((11 * p.progress) / p.work);
        g.save();
        g.beginPath();
        g.rect(x - 4, y - hh, 20, hh);
        g.clip();
        drawCottage({ x: x + 6, L: p.L, seed: 0, age: 0 }, daylightNow());
        g.restore();
      }
      return;
    }
    if (p.cells && p.kind === "hall") {
      const x = p.s * SW,
        y = modTop(p.L);
      for (let i = 0; i < 9; i++) px(x + 2 + i * 9.5, y + 2, 1, 28, "#8a5a34");
      for (let r = 0; r < 4; r++) px(x + 2, y + 2 + r * 8, 76, 1, "#8a5a34");
      if (p.funded) {
        const hh = Math.round((32 * p.progress) / p.work);
        g.save();
        g.beginPath();
        g.rect(x, y + 32 - hh, 80, hh);
        g.clip();
        drawHall({ s: p.s, L: p.L });
        g.restore();
        px(x + 60, y - 8, 1, 10, C.copper);
        px(x + 30, y - 8, 31, 1, C.copper);
      } else {
        g.strokeStyle = "rgba(245,233,201,0.3)";
        g.setLineDash([2, 3]);
        g.strokeRect(x + 0.5, y + 0.5, 79, 31);
        g.setLineDash([]);
      }
      return;
    }
    if (p.cells) {
      const pw = (p.w || 2) * SW,
        ph_ = p.h || 3;
      const x = p.s * SW,
        top = modTop(p.L + ph_ - 1),
        h = modTop(p.L) + 32 - top;
      for (let i = 0; i < pw / 9; i++) px(x + 2 + i * 9.5, top + 2, 1, h - 4, "#8a5a34");
      for (let r = 0; r < h / 8; r++) px(x + 2, top + 2 + r * 8, pw - 4, 1, "#8a5a34");
      if (p.funded) {
        const hh = Math.round((h * p.progress) / p.work);
        px(x + 1, top + h - hh, pw - 2, hh, "rgba(34,64,63,0.7)");
        px(x + 1, top + h - hh, pw - 2, 1, "#cdeff5");
        px(x + pw - 20, top - 8, 1, 10, C.copper);
        px(x + pw / 2 - 10, top - 8, pw / 2 - 9, 1, C.copper);
        if (p.kind === "grand") {
          const k = (frame >> 3) % 4;
          px(x + pw - 20 - k * 6, top - 8 + k * 2, 4, 2, C.scrap);
        }
      } else {
        g.strokeStyle = "rgba(245,233,201,0.3)";
        g.setLineDash([2, 3]);
        g.strokeRect(x + 0.5, top + 0.5, pw - 1, h - 1);
        g.setLineDash([]);
      }
      return;
    }
    const x = p.s * SW,
      y = modTop(p.L);
    for (let i = 0; i < 5; i++) px(x + 2 + i * 9, y + 2, 1, 28, "#8a5a34");
    for (let r = 0; r < 4; r++) px(x + 2, y + 2 + r * 8, 36, 1, "#8a5a34");
    if (p.funded) {
      const h = Math.round((32 * p.progress) / p.work);
      g.save();
      g.beginPath();
      g.rect(x, y + 32 - h, SW, h);
      g.clip();
      spr(p.kind, x, y + capOffset(p.kind));
      g.restore();
      if (p.L > 0) {
        px(x + 30, y - 8, 1, 10, C.copper);
        px(x + 14, y - 8, 17, 1, C.copper);
        px(x + 14, y - 7, 1, 4 + ((frame >> 4) % 3), C.night);
        px(x + 12, y - 3 + ((frame >> 4) % 3), 5, 3, C.scrap);
      }
    } else {
      g.strokeStyle = "rgba(245,233,201,0.3)";
      g.setLineDash([2, 3]);
      g.strokeRect(x + 0.5, y + 0.5, SW - 1, MH - 1);
      g.setLineDash([]);
    }
  }
  function drawAgent(a: Agent) {
    const x = Math.round(a.px) - 3,
      y = Math.round(a.py);
    const bob = a.state === "dance" ? (frame >> 3) & 1 : 0,
      step = a.state === "walk" && !a.climbing ? (frame >> 3) & 1 : 0;
    if (a.state === "dine") {
      const f = a.face > 0;
      px(x, y - 2, 7, 2, C.night);
      px(x + 1, y - 6, 5, 4, a.shirt);
      px(x, y - 7, 7, 1, C.night);
      px(x + 1, y - 11, 5, 4, "#e9b48e");
      px(x + 1, y - 12, 5, 1, a.hair);
      px(f ? x + 4 : x + 2, y - 10, 1, 1, C.night);
      if (a.hat === 1) px(x, y - 13, 7, 1, C.leaf);
      const bx = f ? x + 7 : x - 3;
      px(bx, y - 5, 3, 2, a.bowl === 0 ? C.cream : a.bowl === 1 ? "#d98b3a" : "#9fd8e8");
      px(bx, y - 4, 3, 1, C.night);
      if ((frame >> 3) % 3 === a.bowl) px(bx + 1, y - 7, 1, 1, "rgba(232,225,190,0.8)");
      if (a === followed) {
        g.strokeStyle = C.cyan;
        g.strokeRect(x - 1.5, y - 13.5, 10, 15);
      }
      return;
    }
    const resting = a.state === "rest" || a.state === "sunbathe";
    if (a.state === "sunbathe" && kiteDay && M(a.s, a.L)?.kind === "bridge") {
      const f = a.face > 0;
      const kx = x + (f ? 18 : -14) + Math.sin(simTime * 1.3 + a.px) * 3,
        ky = y - 30 + Math.cos(simTime * 0.9 + a.px) * 3;
      for (let i = 0; i < 10; i++)
        px(
          x + 3 + ((kx + 2 - x - 3) * i) / 10,
          y - 9 + ((ky + 3 - y + 9) * i) / 10,
          1,
          1,
          "rgba(245,233,201,0.5)",
        );
      px(kx, ky + 1, 5, 3, C.magenta);
      px(kx + 1, ky, 3, 5, C.magenta);
      px(kx + 2, ky + 2, 1, 1, C.sun);
      px(kx + 2, ky + 5, 1, 2, C.cyan);
      px(kx + 3, ky + 7, 1, 1, C.cyan);
      px(x + 1, y - 3, 2, 3, C.night);
      px(x + 4, y - 3, 2, 3, C.night);
      px(x, y - 8, 7, 5, C.night);
      px(x + 1, y - 7, 5, 4, a.shirt);
      px(f ? x + 6 : x - 1, y - 11, 1, 4, a.shirt);
      px(x + 1, y - 12, 5, 4, "#e9b48e");
      px(x + 1, y - 13, 5, 1, a.hair);
      px(f ? x + 4 : x + 2, y - 11, 1, 1, C.night);
      if (a === followed) {
        g.strokeStyle = C.cyan;
        g.strokeRect(x - 1.5, y - 15.5, 10, 17);
      }
      return;
    }
    if (a.state === "festival") {
      const f = a.face > 0;
      px(x + 1, y - 3, 2, 3, C.night);
      px(x + 4, y - 3, 2, 3, C.night);
      px(x, y - 8, 7, 5, C.night);
      px(x + 1, y - 7, 5, 4, a.shirt);
      px(f ? x + 6 : x - 1, y - 12, 1, 5, a.shirt);
      px(x + 1, y - 12, 5, 4, "#e9b48e");
      px(x + 1, y - 13, 5, 1, a.hair);
      px(f ? x + 4 : x + 2, y - 11, 1, 1, C.night);
      if (((frame >> 3) + (a.px | 0)) % 4 === 0) {
        px(f ? x + 6 : x - 1, y - 16, 2, 3, C.sun);
        px(f ? x + 6 : x - 1, y - 15, 2, 1, "#fff3c4");
      }
      if (a === followed) {
        g.strokeStyle = C.cyan;
        g.strokeRect(x - 1.5, y - 15.5, 10, 17);
      }
      return;
    }
    if (resting) {
      px(x - 2, y - 3, 10, 3, C.night);
      px(x - 1, y - 2, 8, 1, a.shirt);
      px(x - 2, y - 4, 2, 1, a.hair);
      px(x, y - 4, 2, 1, "#e9b48e");
      if ((frame >> 4) & 1) px(x + 9, y - 6, 1, 1, C.cream);
      return;
    }
    const f = a.face > 0;
    px(x + 1, y - 3 - bob, 2, 3, C.night);
    px(x + 4, y - 3 - bob + (step ? -1 : 0), 2, 3, C.night);
    px(x, y - 8 - bob, 7, 5, C.night);
    px(x + 1, y - 7 - bob, 5, 4, a.shirt);
    if (a.climbing === 1 || a.climbing === 3) px(f ? x + 6 : x - 1, y - 11 - bob, 1, 4, a.shirt);
    if (a.scarf) {
      px(x + 1, y - 8 - bob, 5, 1, a.scarf);
      px(f ? x + 6 : x, y - 7 - bob, 1, 3, a.scarf);
    }
    px(x + 1, y - 12 - bob, 5, 4, "#e9b48e");
    px(x + 1, y - 13 - bob, 5, 1, a.hair);
    px(f ? x + 1 : x + 5, y - 12 - bob, 1, 2, a.hair);
    if (a.hat === 1) px(x, y - 14 - bob, 7, 1, C.leaf);
    if (a.hat === 2) px(x + 2, y - 15 - bob, 3, 2, C.sun);
    if (a.L < 0) px(x + 3, y - 14 - bob, 1, 1, C.sun);
    px(f ? x + 4 : x + 2, y - 11 - bob, 1, 1, C.night);
    if (a.carry) {
      const c = a.carry === "leaf" ? C.leaf : a.carry === "metal" ? C.metal : C.water;
      px(f ? x + 7 : x - 2, y - 7 - bob, 2, 3, c);
    }
    if (a.leading) {
      const gx = f ? x - 8 : x + 8;
      px(gx, y - 5, 5, 3, "#e9dcc0");
      px(gx + (f ? 4 : 0), y - 7, 2, 2, "#e9dcc0");
      px(gx + 1, y - 2, 1, 2, "#7a6b34");
      px(gx + 3, y - 2, 1, 2, "#7a6b34");
    }
    if (a.startled > 0) {
      px(x + 3, y - 16, 1, 1, C.magenta);
      px(x + 1, y - 17, 1, 1, C.magenta);
      px(x + 5, y - 17, 1, 1, C.magenta);
    }
    if (a === followed) {
      g.strokeStyle = C.cyan;
      g.strokeRect(x - 1.5, y - 15.5, 10, 17);
    }
  }
  function drawTree(t: Tree) {
    const x = t.x,
      y = SY;
    const h = 4 + t.size * 5;
    const dry = forestHealth < 0.35;
    px(x - 1, y - h, 2, h, C.trunk);
    const r = 2 + t.size * 2,
      col = dry ? "#7a6b34" : C.leafD,
      col2 = dry ? "#a18a3a" : C.leaf;
    px(x - r, y - h - r, r * 2, r * 2, col);
    px(x - r + 1, y - h - r - 1, r * 2 - 2, 1, col2);
    px(x - r + 1, y - h - r + 1, r - 1, r - 1, col2);
    px(x, y - h - r + 2, 2, 2, dry ? "#c9b08a" : C.leafL);
    for (let i = 0; i < t.amt; i++) px(x - r + 2 + i * 3, y - h - 1, 1, 1, C.sun);
  }
  function drawBackground() {
    const dl = daylightNow(),
      night = 1 - dl,
      z = cam.zoom;
    const rgb = (a: number, b: number, c: number) =>
      `rgb(${Math.round(a)},${Math.round(b)},${Math.round(c)})`;
    const top = rgb(6 + 34 * dl, 12 + 54 * dl, 24 + 64 * dl),
      bot = rgb(18 + 58 * dl, 36 + 72 * dl, 52 + 58 * dl);
    const grad = ctx.createLinearGradient(0, -cam.y * z, 0, (SY - cam.y) * z);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    if (dl > 0.2 && dl < 0.6) {
      ctx.fillStyle = `rgba(214,79,155,${(0.2 - Math.abs(dl - 0.4)) * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (night > 0.3 && !rainNow) {
      ctx.fillStyle = `rgba(245,233,201,${(night - 0.3) * 0.7})`;
      for (const s of stars) {
        if (((frame >> 4) + (s.x | 0)) % 7 === 0 && s.b < 0.5) continue;
        const sx = s.x - cam.x * 0.2,
          sy = s.y - cam.y * 0.2;
        ctx.fillRect(sx * z, sy * z, z, z);
      }
    }
    const ang = tod * Math.PI * 2 - Math.PI / 2,
      sx = WW / 2 + Math.cos(ang) * 170,
      sy = SY * 0.5 - Math.sin(ang) * SY * 0.42;
    const disc = (x: number, y: number, r: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(
        (x - cam.x - r) * z,
        (y - cam.y * 0.3 - (SY - H) * 0.7 - r) * z,
        r * 2 * z,
        r * 2 * z,
      );
    };
    disc(sx, sy, 7, `rgba(242,193,78,${0.35 + 0.2 * dl})`);
    disc(sx, sy, 4, `rgba(255,243,196,${0.5})`);
    disc(WW - sx, sy, 5, "rgba(233,220,192,0.6)");
    disc(WW - sx + 2, sy - 1, 3, top);
    const sk = `rgba(${Math.round(30 + 40 * dl)},${Math.round(50 + 70 * dl)},${Math.round(70 + 80 * dl)},0.9)`;
    ctx.fillStyle = sk;
    for (let i = 0; i < 26; i++) {
      const bx = i * 26 + ((i * 37) % 13) - cam.x * 0.45,
        bh = 40 + ((i * 53) % 90),
        bw = 14 + ((i * 7) % 12);
      const Y = SY - 8 - bh - cam.y * 0.45 - (SY - H) * 0.55;
      ctx.fillRect(bx * z, Y * z, bw * z, (bh + 500) * z);
      if (dl < 0.5 && i % 3 === 0) {
        ctx.fillStyle = `rgba(242,193,78,${0.5 * (1 - dl)})`;
        ctx.fillRect((bx + 4) * z, (Y + 10) * z, 2 * z, 2 * z);
        ctx.fillStyle = sk;
      }
    }
    // (rainbow removed)
    for (const s_ of shooters) {
      const X = (s_.x - cam.x * 0.2) * z,
        Y = (s_.y - cam.y * 0.2) * z;
      ctx.fillStyle = `rgba(245,233,201,${s_.life})`;
      ctx.fillRect(X, Y, 2 * z, z);
      ctx.fillRect(X + 3 * z, Y - z, 3 * z, z);
      ctx.fillRect(X + 7 * z, Y - 2 * z, 2 * z, z);
    }
    if (birds) {
      for (let i = 0; i < 7; i++) {
        const k = i - 3,
          bx = birds.x - Math.abs(k) * 7,
          by = birds.y + Math.abs(k) * 4 + Math.sin(birds.t * 6 + i) * 1.5;
        const X = (bx - cam.x * 0.8) * z,
          Y = (by - cam.y * 0.8 - (SY - H) * 0.2) * z;
        ctx.fillStyle = "rgba(28,26,46,0.85)";
        ctx.fillRect(X, Y, 2 * z, z);
        ctx.fillRect(X - z, Y - z, z, z);
        ctx.fillRect(X + 2 * z, Y - z, z, z);
      }
    }
    ctx.fillStyle = `rgba(120,150,160,${0.08 + 0.3 * dl})`;
    for (const c of clouds) {
      const X = c.x - cam.x * 0.6,
        Y = c.y - cam.y * 0.6 - (SY - H) * 0.4;
      ctx.fillRect(X * z, Y * z, c.w * z, 4 * z);
      ctx.fillRect((X + 6) * z, (Y - 3) * z, (c.w - 12) * z, 3 * z);
    }
  }
  function drawUnderground() {
    px(0, SY + 8, WW, WH - SY - 8, C.rock);
    for (let y = SY + 8; y < WH; y += 6) {
      const shade = ((y / 6) | 0) % 3;
      px(0, y, WW, 1, shade === 0 ? C.rockD : shade === 1 ? C.rockL : C.rock);
    }
    for (let i = 0; i < 120; i++) {
      const x = (i * 61) % WW,
        y = SY + 12 + ((i * 97) % (WH - SY - 20));
      px(x, y, 2, 1, C.rockD);
      if (i % 9 === 0) px(x + 1, y - 1, 1, 1, C.copper);
    }
    px(0, SY + 8, WW, 1, C.rockD);
    // grove cliff on far left
    px(0, SY - 60, 3, 60, C.rockD);
    px(3, SY - 52, 2, 52, C.rock);
    px(0, SY - 62, 6, 2, C.leafD);
  }
  function renderWorld() {
    g.clearRect(0, 0, WW, WH);
    const dl = daylightNow();
    drawUnderground();
    for (const st of street) {
      spr("street_" + st.sub, st.s * SW, SY - 16);
      if (st.sub === "rubble")
        for (let i = 0; i < Math.min(6, st.amt); i++)
          px(st.s * SW + 6 + i * 3, SY - 6 - (i % 2), 2, 2, i % 2 ? C.scrap : "#8f7a5a");
      if (st.sub === "hub") {
        const f = stock.water / waterCap;
        px(st.s * SW + 3, SY - 5 - Math.round(3 * f), 34, Math.round(3 * f) + 1, C.water);
        if (frame % 3 === 0 && f > 0.1)
          particles.push({
            x: st.s * SW + 20 + rnd(-1, 1),
            y: SY - 14,
            vx: rnd(-8, 8),
            vy: rnd(-18, -8),
            life: 0.6,
            c: C.water,
            s: 1,
          });
      }
    }
    for (const tr of trees) drawTree(tr);
    if (supper > 0 && !theHall()) {
      px(HX - 2, SY - 6, 84, 2, "#7a5a34");
      px(HX - 2, SY - 4, 84, 1, C.night);
      px(HX + 2, SY - 3, 2, 3, "#5a4326");
      px(HX + 76, SY - 3, 2, 3, "#5a4326");
      for (let i = 0; i < 5; i++) {
        px(HX + 6 + i * 16, SY - 12, 1, 6, C.night);
        px(HX + 5 + i * 16, SY - 14, 3, 2, ((frame >> 3) + i) % 4 ? C.sun : "#e29a2a");
      }
    }
    const tops = CITY.map(heightOf);
    for (let i = 0; i < CITY.length - 1; i++) {
      const s = CITY[i];
      if (tops[i] > 0 && tops[i + 1] > 0 && Math.abs(tops[i] - tops[i + 1]) <= 2) {
        const y0 = modTop(tops[i]) - 2,
          y1 = modTop(tops[i + 1]) - 2;
        for (let k = 0; k <= 8; k++) {
          const u = k / 8,
            x = s * SW + 20 + u * SW,
            y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 5;
          px(x, y, 1, 1, C.night);
          if (k % 2 && dl < 0.5) px(x, y + 1, 1, 1, [C.sun, C.magenta, C.cyan][k % 3]);
        }
      }
    }
    for (const s of CITY) drawSpine(s);
    for (const b of allMods()) drawRoom(b);
    for (let i = 0; i < CITY.length; i++) {
      const s = CITY[i],
        h = tops[i];
      if (h > 0 && !projects.some((p) => p.s === s && p.L === h + 1)) drawRoof(s, h);
    }
    for (const st of allMods()) {
      const pair = st.pair;
      if (st.kind !== "cable" || !pair || st.s >= pair.s) continue;
      const x0 = st.s * SW + 20,
        y0 = modTop(st.L) - 8,
        x1 = pair.s * SW + 20,
        y1 = modTop(pair.L) - 8;
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        px(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 4, 1, 1, C.night);
      }
      const riders = agents.filter(
        (a) =>
          a.climbing === 4 &&
          (a.s === st.s || a.s === pair.s || a.ridingTo === st.s || a.ridingTo === pair.s),
      );
      const cars = riders.length
        ? riders.map((a) => ({ x: a.px, y: a.py }))
        : [{ x: x0, y: y0 + 10 }];
      for (const c of cars) {
        px(c.x - 5, c.y - 16, 10, 1, C.night);
        px(c.x - 1, c.y - 20, 2, 4, C.night);
        px(c.x - 5, c.y - 15, 10, 11, "#6f8487");
        px(c.x - 4, c.y - 14, 8, 5, C.cyan);
        px(c.x - 5, c.y - 4, 10, 1, C.night);
      }
    }
    {
      const lg = theLagoon();
      if (lg) {
        const tx = lg.s * SW + 40,
          ty = modTop(lg.L + 2) - 1;
        for (const m of allMods().filter((m) => m.kind === "marsh")) {
          const px0 = m.s * SW + 37,
            y0 = modTop(m.L) + 32;
          const midY = Math.max(y0, ty - 6);
          px(px0, y0, 1, Math.max(0, midY - y0), C.copper);
          const x1 = Math.min(px0, tx),
            x2 = Math.max(px0, tx);
          px(x1, midY, x2 - x1 + 1, 1, C.copper);
          px(tx, midY, 1, Math.max(0, ty - midY), C.copper);
          if (m.channel) {
            const L1 = midY - y0,
              L2 = x2 - x1,
              L3 = Math.max(0, ty - midY),
              tot = L1 + L2 + L3,
              d = (simTime * 40 + m.s * 17) % Math.max(1, tot);
            let dx, dy;
            if (d < L1) {
              dx = px0;
              dy = y0 + d;
            } else if (d < L1 + L2) {
              dx = px0 < tx ? px0 + (d - L1) : px0 - (d - L1);
              dy = midY;
            } else {
              dx = tx;
              dy = midY + (d - L1 - L2);
            }
            px(dx, dy, 1, 1, "#7fd4e0");
          }
        }
      }
    }
    for (const p of projects) drawScaffold(p);
    if (ship.active) {
      const sx = Math.round(ship.x),
        sy = Math.round(ship.y);
      px(sx - 22, sy - 8, 44, 12, "#e37bb6");
      px(sx - 18, sy - 11, 36, 3, "#f2a5cb");
      px(sx - 18, sy + 4, 36, 3, "#c0568f");
      px(sx - 24, sy - 6, 2, 8, "#c0568f");
      px(sx + 22, sy - 6, 2, 8, "#c0568f");
      for (let i = 0; i < 4; i++) px(sx - 14 + i * 10, sy - 8, 1, 12, "#a34a7a");
      px(sx - 6, sy + 7, 1, 4, C.night);
      px(sx + 6, sy + 7, 1, 4, C.night);
      px(sx - 9, sy + 11, 18, 5, "#7a5a34");
      px(sx - 9, sy + 10, 18, 1, "#a17a4a");
      px(sx - 7, sy + 12, 3, 2, C.sun);
      px(sx + 4, sy + 12, 3, 2, C.sun);
      const pr = (frame >> 2) & 1;
      px(sx + 10, sy + 12 + (pr ? -2 : 2), 1, pr ? 4 : 1, C.stoneD);
      px(sx + 10, sy + 13, 2, 1, C.stoneD);
      if (ship.phase === 1) {
        px(
          sx,
          sy + 16,
          1,
          Math.max(0, modTop(Math.max(1, cityHeight())) - 4 - (sy + 16)),
          "rgba(245,233,201,0.6)",
        );
      }
    }
    {
      const hall = theHall();
      if (hall) {
        const cx = hall.s * SW + Math.round(cat.x),
          cy = Math.round(cat.y);
        const sl = cat.state === "sleep";
        if (sl) {
          px(cx, cy, 6, 2, C.night);
          px(cx + 5, cy - 1, 2, 1, C.night);
        } else {
          px(cx, cy - 1, 5, 3, C.night);
          px(cx + (cat.dir > 0 ? 4 : -1), cy - 3, 2, 2, C.night);
          px(cx + (cat.dir > 0 ? 4 : 0), cy - 4, 1, 1, C.night);
          px(cx + (cat.dir > 0 ? 5 : 0), cy - 4, 1, 1, C.night);
          px(cx + (cat.dir > 0 ? -1 : 5), cy - 3 + ((frame >> 4) & 1), 1, 3, C.night);
          if (cat.state === "stretch") px(cx - 1, cy + 1, 7, 1, C.night);
          px(cx + (cat.dir > 0 ? 5 : 0), cy - 2, 1, 1, (frame >> 5) & 1 ? C.sun : C.night);
        }
      }
    }
    if (daylightNow() < 0.3 && supper <= 0) {
      const fx = Math.round(fox.x),
        fy = SY;
      const f = fox.dir > 0;
      px(fx, fy - 4, 7, 3, "#e0563f");
      px(fx + (f ? 6 : -1), fy - 6, 2, 3, "#e0563f");
      px(fx + (f ? 7 : -1), fy - 7, 1, 1, "#e0563f");
      px(fx + (f ? -3 : 7), fy - 5, 3, 2, "#e0563f");
      px(fx + (f ? -3 : 9), fy - 4, 1, 1, C.cream);
      px(fx + 1, fy - 1, 1, 1, C.night);
      px(fx + 5, fy - 1, 1, 1, C.night);
      px(fx + (f ? 7 : -1), fy - 5, 1, 1, C.sun);
    }
    if (marker != null) {
      const x = marker * SW + 20,
        y = modTop(Math.max(1, heightOf(marker) + 1)) - 14;
      px(x, y, 1, 12, C.trunk);
      px(x + 1, y, 6, 4, C.magenta);
      px(x + 1, y + 1, 2, 2, "#f2a5cb");
    }
    const sorted = agents.filter((a) => a.placed).sort((a, b) => a.py - b.py);
    for (const a of sorted) drawAgent(a);
    for (const p of particles) {
      if (p.note) {
        px(p.x, p.y, 1, 3, p.c);
        px(p.x + 1, p.y + 2, 1, 1, p.c);
        px(p.x + 1, p.y, 1, 1, p.c);
      } else if (p.lantern) {
        px(p.x, p.y, 2, 3, p.c);
        px(p.x, p.y + 1, 2, 1, "#fff3c4");
      } else px(p.x, p.y, p.s, p.rain ? 5 : p.drip ? 2 : p.s, p.c);
    }
    if (rainNow)
      for (let i = 0; i < 14; i++) {
        const x = (frame * 7 + i * 53) % WW;
        px(x, SY + 1 + (i % 2), 3, 1, i % 4 ? "rgba(140,215,225,0.35)" : "rgba(242,193,78,0.35)");
      }
    const dark = 1 - dl;
    // underground is always dim
    g.fillStyle = "rgba(10,14,30,0.45)";
    g.fillRect(0, SY + 8, WW, WH - SY - 8);
    g.fillStyle = `rgba(10,18,40,${0.22 + dark * 0.58})`;
    g.fillRect(0, 0, WW, SY + 8);
    const ga = (0.5 + 0.75 * dark) * (blackout > 0 ? 0.25 : 1);
    g.globalCompositeOperation = "lighter";
    const glow = (x: number, y: number, r: number, c: string) => {
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, c);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const b of allMods()) {
      const cx = b.s * SW + 20,
        cy = modTop(b.L) + 16;
      if (b.L < 0) {
        if (b.kind === "cave") glow(cx, cy, 20, "rgba(107,227,217,0.35)");
        else if (b.kind === "geo") glow(cx, cy, 24, "rgba(224,86,63,0.4)");
        else glow(cx, cy, 16, "rgba(242,193,78,0.28)");
        continue;
      }
      if (["home", "workshop", "garden"].includes(b.kind))
        glow(cx, cy, 24, `rgba(242,193,78,${0.34 * ga})`);
      if (b.kind === "market") glow(cx, cy, 26, `rgba(227,123,182,${0.34 * ga})`);
      if (b.kind === "library") glow(cx, cy, 24, `rgba(150,100,220,${0.34 * ga})`);
      if (b.kind === "bath" || b.kind === "tank" || b.kind === "turbine")
        glow(cx, cy, 20, `rgba(87,197,214,${0.26 * ga})`);
      if (b.kind === "solar") glow(cx, cy, 16, `rgba(242,193,78,${0.2 * ga})`);
      if (b.kind === "lift") glow(cx, cy, 16, `rgba(214,79,155,${0.2 * ga})`);
      if (b.kind === "wind") glow(cx, cy - 4, 14, `rgba(214,79,155,${0.22 * ga})`);
      if (b.kind === "dome") glow(cx, cy - 6, 26, `rgba(111,191,115,${0.34 * ga})`);
      if (b.kind === "wild") {
        glow(cx, cy, 26, `rgba(111,191,115,${0.3 * ga})`);
        if (b.plants > 72) glow(cx, cy - 4, 14, `rgba(227,123,182,${0.22 * ga})`);
      }
      if (b.kind === "hall") {
        const k = supper > 0 ? 1.25 : 1;
        glow(cx - 2, cy + 2, 34, `rgba(242,193,78,${0.2 * ga * k})`);
        glow(cx + 42, cy + 2, 34, `rgba(242,193,78,${0.2 * ga * k})`);
        glow(cx + 20, cy + 6, 64, `rgba(227,123,182,${0.09 * ga * k})`);
      }
      if (b.kind === "grand") {
        const gx = b.s * SW + b.w * 20,
          gy = modTop(b.L + Math.floor(b.h / 2)) + 16;
        glow(gx, gy, 40 + b.w * 14, `rgba(111,191,115,${0.34 * ga})`);
        if (b.tier >= 3) glow(gx, gy, 30 + b.w * 10, `rgba(242,193,78,${0.16 * ga})`);
        if (b.tier >= 2)
          glow(b.s * SW + b.w * SW - 12, modTop(b.L) + 10, 24, `rgba(107,227,217,${0.25 * ga})`);
      }
      if (b.kind === "lagoon") {
        glow(cx + 20, modTop(b.L + 1) + 20, 56, `rgba(87,197,214,${0.35 * ga})`);
        glow(cx + 20, modTop(b.L) + 16, 26, `rgba(242,193,78,${0.18 * ga})`);
      }
      if (b.kind === "marsh") glow(cx, cy + 4, 22, `rgba(87,197,214,${0.25 * ga})`);
      if (b.kind === "battery") glow(cx, cy, 20, `rgba(107,227,217,${(0.2 + spill * 0.4) * ga})`);
      if (b.kind === "foundry") glow(cx, cy, 26, "rgba(224,86,63,0.4)");
      if (b.kind === "loom" || b.kind === "apiary" || b.kind === "aviary")
        glow(cx, cy, 20, `rgba(242,193,78,${0.26 * ga})`);
      if (b.kind === "observatory") glow(cx, modTop(b.L) + 8, 22, `rgba(107,227,217,${0.3 * ga})`);
      if (b.kind === "pier" || b.kind === "belltower")
        glow(cx, modTop(b.L) + 8, 18, `rgba(227,123,182,${0.25 * ga})`);
      if (spill > 0 && b.kind === "solar") glow(cx, cy, 30, `rgba(242,193,78,${0.25 * spill})`);
      if (b.glowvine) glow(cx, cy - 6, 20, `rgba(107,227,217,${0.3 * ga})`);
      if (b.find === "geode") glow(cx, cy, 22, "rgba(177,140,255,0.45)");
      if (b.find === "spring") glow(cx, cy + 8, 16, "rgba(127,212,224,0.35)");
      if (b.kind === "atrium") {
        glow(cx + 20, modTop(b.L + 1) + 16, 60, `rgba(111,191,115,${0.32 * ga})`);
        glow(cx + 20, modTop(b.L + 2) + 10, 30, `rgba(107,227,217,${0.15 * ga})`);
      }
      if (b.kind === "beacon") {
        glow(cx, modTop(b.L) - 6, 64, `rgba(107,227,217,${0.4 * ga})`);
        glow(cx, modTop(b.L) - 6, 30, `rgba(227,123,182,${0.35 * ga})`);
      }
    }
    glow(HX + 20, SY - 12, 32, `rgba(242,193,78,${0.35 * ga})`);
    glow(HX + 60, SY - 12, 32, `rgba(242,193,78,${0.35 * ga})`);
    if (supper > 0 && !theHall()) {
      glow(HX + 40, SY - 10, 70, `rgba(242,193,78,${0.3 * ga})`);
    }
    glow(200, SY - 16, 50, `rgba(227,123,182,${0.12 * ga})`);
    for (const st of street)
      if (st.sub === "plaza") glow(st.s * SW + 7, SY - 14, 16, `rgba(242,193,78,${0.4 * ga})`);
    for (const st of street)
      if (st.sub === "grove") glow(st.s * SW + 20, SY - 18, 30, `rgba(111,191,115,${0.14 * ga})`);
    for (const c of cottages) {
      glow(c.x, feetY(c.L) - 5, 14, `rgba(242,193,78,${0.4 * ga})`);
      glow(c.x, feetY(c.L) - 5, 24, `rgba(227,123,182,${0.1 * ga})`);
    }
    for (const a of agents)
      if (a.L < 0 || stock.light > 3)
        glow(a.px, a.py - 7, 9, `rgba(245,233,201,${a.L < 0 ? 0.35 : 0.14 * ga})`);
    if (flash > 0) {
      g.globalCompositeOperation = "source-over";
      g.fillStyle = `rgba(200,215,255,${flash * 0.22})`;
      g.fillRect(0, 0, WW, SY + 8);
    }
    g.globalCompositeOperation = "source-over";
    if (rainNow) {
      g.fillStyle = "rgba(40,110,130,0.10)";
      g.fillRect(0, 0, WW, SY + 8);
    }
  }
  function clampCam() {
    const vw = W / cam.zoom,
      vh = H / cam.zoom;
    cam.x = vw >= WW ? (WW - vw) / 2 : Math.max(0, Math.min(WW - vw, cam.x));
    cam.y = vh >= WH ? (WH - vh) / 2 : Math.max(0, Math.min(WH - vh, cam.y));
  }
  function render() {
    if (followed && cam.track) {
      cam.x = followed.px - W / (2 * cam.zoom);
      cam.y = followed.py - 8 - H / (2 * cam.zoom);
    }
    clampCam();
    drawBackground();
    renderWorld();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(wc, cam.x, cam.y, W / cam.zoom, H / cam.zoom, 0, 0, W, H);
    // drifting mist
    const z = cam.zoom;
    for (let i = 0; i < 5; i++) {
      const fy = SY - 60 - i * 150 + Math.sin(simTime * 0.15 + i) * 10,
        fx = ((simTime * (4 + i * 2) + i * 97) % (WW + 200)) - 100;
      const Y = (fy - cam.y) * z,
        X = (fx - cam.x) * z;
      if (Y < -40 * z || Y > H) continue;
      const gr = ctx.createLinearGradient(X, 0, X + 160 * z, 0);
      gr.addColorStop(0, "rgba(120,170,175,0)");
      gr.addColorStop(0.5, `rgba(120,170,175,${rainNow ? 0.1 : 0.06})`);
      gr.addColorStop(1, "rgba(120,170,175,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(X, Y, 160 * z, 18 * z);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(200,215,255,${flash * 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Draws the town as the view has it. `frameNumber` drives the small animations. */
  function draw(v: View, frameNumber: number, follow: Agent | null) {
    view = v;
    frame = frameNumber;
    followed = follow;
    ({ agents, projects, trees, street, cottages, stock, flow, ship, cat, fox, birds, shooters } =
      v);
    ({ waterCap, lightCap, spill, supper, blackout, bell, flash, tod, simTime, forestHealth } = v);
    ({ marker, kiteDay, rainNow, wildSlots } = v);
    render();
  }

  return { draw, clampCam };
}
