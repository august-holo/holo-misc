// Ties the pieces together for one canvas: the connection, the view of the town,
// the camera, and the drawing loop. Reports what the panels around it should say.

import { connect, type Status } from "./connection";
import {
  BLD,
  GRAND_NAMES,
  H,
  SPECIES,
  SPECIES_ORDER,
  SY,
  W,
  WW,
  isWildKind,
  levelAt,
  lvName,
  modTop,
  rint,
  rnd,
  slotOf,
} from "./defs";
import { createMusic } from "./music";
import { burst, stepParticles, type Cloud, type Particle } from "./particles";
import {
  ZFIT,
  ZOOMS,
  createRenderer,
  loadSprites,
  type Camera,
  type Sprites,
  type Star,
} from "./renderer";
import { View, type Agent, type Room } from "./view";

export interface WildRow {
  key: string;
  label: string;
  balanced: boolean;
  plants: number;
  creatures: { color: string; count: number }[];
  note: string;
}

export interface Followed {
  name: string;
  about: string;
  thought: string;
  /** Each 0 to 100. */
  bars: {
    energy: number;
    joy: number;
    curious: number;
    chatty: number;
    diligent: number;
    whimsy: number;
  };
  doing: string;
}

export interface Panel {
  status: Status | "resting";
  clock: string;
  light: string;
  leaf: number;
  metal: number;
  water: string;
  tenders: string;
  reach: string;
  council: string;
  rain: string;
  almanac: { day: number; text: string }[];
  log: { id: number; text: string }[];
  wildStage: string;
  wildRows: WildRow[];
  followed: Followed | null;
  cameraFree: boolean;
  zoom: string;
  daysLeft: number | null;
}

const STEP = 1 / 30;
const PANEL_EVERY_MS = 200;
const LOG_LINES = 3;
/** A tab left in the background gives up its place after this long. */
const REST_AFTER_MS = 60_000;

function floorStatus(f: Room) {
  const K =
    f.kind === "grand" ? (f.w * f.h) / 2.5 : f.kind === "atrium" || f.kind === "lagoon" ? 2.2 : 1;
  if ((f.kind === "marsh" || f.kind === "lagoon") && f.level < 0.35) return "low water";
  if (f.plants < 30) return "bare";
  if (f.plants > 85) return "overgrown";
  const a = SPECIES_ORDER.reduce((n, k) => n + f[k], 0);
  if (a < 2) return "quiet";
  if (a > 14 * K) return "swarming";
  if (f.goat > 0 && f.plants < 40) return "overgrazed";
  return "balanced";
}

export class Terrarium {
  readonly sprites: Sprites;
  private view = new View();
  private cam: Camera = { zoom: 1, x: (WW - W) / 2, y: SY - H + 60, track: true };
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private renderer: ReturnType<typeof createRenderer>;
  private music = createMusic(() => ({
    daylight: this.view.daylight(),
    raining: this.view.rainNow,
  }));

  private connection: ReturnType<typeof connect> | null = null;
  private status: Panel["status"] = "connecting";
  private followed: number | null = null;
  private log: { id: number; text: string }[] = [];
  private logId = 0;
  private seenLog = 0;
  private run = 0;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private tick = 0;
  private panelAt = 0;
  private rest: ReturnType<typeof setTimeout> | null = null;
  private stop = new AbortController();

  constructor(
    private canvas: HTMLCanvasElement,
    private onPanel: (p: Panel) => void,
  ) {
    this.sprites = loadSprites();
    for (let i = 0; i < 90; i++)
      this.stars.push({ x: rnd(0, WW), y: rnd(0, SY * 0.8), b: rnd(0.3, 1) });
    for (let i = 0; i < 10; i++)
      this.clouds.push({
        x: rnd(-60, WW + 60),
        y: rnd(20, SY - 120),
        w: rint(24, 60),
        v: rnd(2, 6),
      });
    this.renderer = createRenderer(
      canvas,
      this.sprites,
      this.cam,
      this.particles,
      this.stars,
      this.clouds,
    );
    this.listen();
    this.open();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.stop.abort();
    if (this.rest) clearTimeout(this.rest);
    this.connection?.close();
    this.music.stop();
  }

  // ---------- connection ----------

  private open() {
    this.connection?.close();
    this.connection = connect({
      status: (s) => (this.status = s),
      world: (m) => {
        this.view.applyWorld(m);
        if (m.run !== this.run) {
          // A new town: nothing from the old one carries over.
          this.run = m.run;
          this.followed = null;
          this.seenLog = 0;
          this.particles.length = 0;
        }
        for (const line of this.view.log) {
          if (line.n > this.seenLog) {
            this.seenLog = line.n;
            this.say(line.t);
          }
        }
      },
      frame: (m) => {
        for (const effect of this.view.applyFrame(m, performance.now() / 1000)) {
          if (effect.fx === "celebrate") this.music.celebrate();
          else burst(this.particles, this.view, effect);
        }
      },
    });
  }

  private say(text: string) {
    this.log.push({ id: ++this.logId, text });
    while (this.log.length > LOG_LINES) this.log.shift();
  }

  // ---------- drawing ----------

  private loop = (now: number) => {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const view = this.view;
    if (view.ready) {
      view.sample(now / 1000);
      this.acc += real;
      let n = 0;
      while (this.acc >= STEP && n < 4) {
        stepParticles(this.particles, this.clouds, view, this.tick++, STEP, this.cam.y);
        this.acc -= STEP;
        n++;
      }
      if (this.acc > STEP * 4) this.acc = 0;
      const followed = this.followed === null ? null : (view.agents[this.followed] ?? null);
      this.renderer.draw(view, Math.floor(now * 0.06), followed);
    }
    if (now - this.panelAt >= PANEL_EVERY_MS) {
      this.panelAt = now;
      this.onPanel(this.panel());
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---------- camera ----------

  private setZoom(z: number, fx = W / 2, fy = H / 2) {
    const cam = this.cam;
    const old = cam.zoom;
    z = Math.max(ZFIT, Math.min(4, z));
    if (z === old) return;
    const wx = cam.x + fx / old,
      wy = cam.y + fy / old;
    cam.zoom = z;
    cam.x = wx - fx / z;
    cam.y = wy - fy / z;
    this.renderer.clampCam();
  }

  stepZoom(dir: number, fx?: number, fy?: number) {
    const i = ZOOMS.findIndex((v) => Math.abs(v - this.cam.zoom) < 0.01);
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 1 : i) + dir));
    this.setZoom(ZOOMS[ni], fx, fy);
  }

  showAll() {
    this.cam.track = false;
    this.setZoom(ZFIT);
  }

  showTop() {
    this.cam.track = false;
    this.cam.y = modTop(Math.max(1, this.view.cityHeight())) - 40;
    this.renderer.clampCam();
  }

  showStreet() {
    const cam = this.cam;
    cam.track = false;
    cam.y = SY - H / cam.zoom + 80 / cam.zoom;
    cam.x = (WW - W / cam.zoom) / 2;
    this.renderer.clampCam();
  }

  showDeep() {
    const cam = this.cam;
    cam.track = false;
    cam.y = modTop(-Math.max(1, this.view.cityDepth())) - H / cam.zoom + 80;
    this.renderer.clampCam();
  }

  // ---------- music ----------

  toggleMusic() {
    const on = this.music.toggle();
    this.say(on ? "Somebody put a record on in the hub." : "The record runs out.");
    return on;
  }

  setVolume(v: number) {
    this.music.setVol(v);
  }

  // ---------- input ----------

  private listen() {
    const cv = this.canvas;
    const cam = this.cam;
    const signal = this.stop.signal;
    const toCanvas = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };

    cv.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const c = toCanvas(e);
        if (e.shiftKey) {
          cam.track = false;
          cam.y += e.deltaY / cam.zoom;
          this.renderer.clampCam();
        } else this.stepZoom(e.deltaY < 0 ? 1 : -1, c.x, c.y);
      },
      { passive: false, signal },
    );

    let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    cv.addEventListener(
      "pointerdown",
      (e) => {
        cv.setPointerCapture(e.pointerId);
        const c = toCanvas(e);
        drag = { sx: c.x, sy: c.y, cx: cam.x, cy: cam.y, moved: false };
      },
      { signal },
    );
    cv.addEventListener(
      "pointermove",
      (e) => {
        if (!drag) return;
        const c = toCanvas(e);
        const dx = c.x - drag.sx,
          dy = c.y - drag.sy;
        if (Math.hypot(dx, dy) > 4) {
          drag.moved = true;
          cv.classList.add("drag");
          cam.track = false;
        }
        if (drag.moved) {
          cam.x = drag.cx - dx / cam.zoom;
          cam.y = drag.cy - dy / cam.zoom;
          this.renderer.clampCam();
        }
      },
      { signal },
    );
    cv.addEventListener(
      "pointerup",
      (e) => {
        cv.classList.remove("drag");
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.moved) return;
        const c = toCanvas(e);
        this.click(cam.x + c.x / cam.zoom, cam.y + c.y / cam.zoom);
      },
      { signal },
    );
    cv.addEventListener(
      "pointercancel",
      () => {
        drag = null;
        cv.classList.remove("drag");
      },
      { signal },
    );

    // A tab nobody is looking at gives its place to someone else, and lets the
    // town rest when it was the last one watching.
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          this.rest = setTimeout(() => {
            this.connection?.close();
            this.connection = null;
            this.status = "resting";
          }, REST_AFTER_MS);
        } else {
          if (this.rest) clearTimeout(this.rest);
          if (!this.connection) this.open();
        }
      },
      { signal },
    );
  }

  private click(wx: number, wy: number) {
    const view = this.view;
    const cam = this.cam;
    let best: number | null = null,
      bd = 8 / Math.sqrt(cam.zoom) + 3;
    view.agents.forEach((a, i) => {
      if (!a.placed) return;
      const d = Math.hypot(a.px - wx, a.py - 7 - wy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best !== null) {
      this.followed = best;
      cam.track = true;
      if (cam.zoom < 2) this.setZoom(3);
      this.say(`Following ${view.agents[best].name}.`);
      return;
    }

    const s = slotOf(wx),
      L = levelAt(wy),
      m = L !== 99 ? view.M(s, L) : null;
    if (m && m.kind !== "street") this.say(this.describe(m, L));
    else this.followed = null;
  }

  private describe(m: Room, L: number) {
    const mm = m.ref ?? m;
    const pct = (v: number) => Math.round(v * 100);
    switch (mm.kind) {
      case "grand":
        return `${GRAND_NAMES[mm.tier - 1]}: ${mm.w} towers wide, ${mm.h} storeys, canopy ${pct(mm.canopy)}%, ${Math.round(SPECIES_ORDER.reduce((n, k) => n + mm[k], 0))} creatures.`;
      case "hall":
        return `Supper hall: ${this.view.supper > 0 ? "supper is on right now." : "the pot goes on at dusk."}`;
      case "atrium":
        return `Cedar atrium: ${mm.cedars.filter((c) => c.h > 0.9).length}/5 cedars full-grown, canopy ${pct(mm.canopy)}%.`;
      case "lagoon":
        return `Tide atrium: ${pct(mm.level)}% full, kelp ${Math.round(mm.plants)}%, ${Math.round(mm.minnow)} minnows, ${Math.round(mm.pike)} pike, ${Math.round(mm.crab)} crabs.`;
      case "marsh":
        return `Marsh pod: ${pct(Math.min(1, mm.level))}% full${mm.channel ? ", channel running" : ""}.`;
      default:
        return `${BLD[m.kind].name} (${lvName(L)}): ${BLD[m.kind].blurb}`;
    }
  }

  // ---------- panels ----------

  private panel(): Panel {
    const v = this.view;
    const tod = v.tod;
    const phase =
      tod < 0.2 ? "night" : tod < 0.3 ? "dawn" : tod < 0.7 ? "day" : tod < 0.8 ? "dusk" : "night";
    const perMinute = (x: number) => (x * 60).toFixed(1);
    const f = v.flow;
    const followed = this.followed === null ? null : (v.agents[this.followed] ?? null);
    const zoom = this.cam.zoom;

    return {
      status: this.status,
      clock: v.ready ? `Day ${v.day}, ${phase}${v.rainNow ? ", raining" : ""}` : "",
      light: `${Math.floor(v.stock.light)}/${v.lightCap}`,
      leaf: Math.floor(v.stock.leaf),
      metal: Math.floor(v.stock.metal),
      water: `${Math.floor(v.stock.water)}/${v.waterCap}`,
      tenders: `${v.agents.length}/${v.capacity()}`,
      reach: `${v.cityHeight()} up · ${v.cityDepth()} down`,
      council: v.projects.length
        ? `Building: ${v.projects
            .map(
              (p) =>
                `${BLD[p.kind].name.toLowerCase()} (${lvName(p.L)}${p.funded ? ")" : ", gathering)"}`,
            )
            .join(", ")}`
        : "The council is between votes.",
      rain: `In ${perMinute(f.inflow)}/min${v.rainNow ? " (raining)" : ""} · gardens ${perMinute(f.gardens)} · grove ${perMinute(f.forest)} · turbines ${perMinute(f.turbine)} · wild ${perMinute(f.wild)} · grove health ${Math.round(v.forestHealth * 100)}%`,
      almanac: v.almanac.map((e) => ({ day: e.day, text: e.t })),
      log: [...this.log],
      wildStage: this.wildStage(),
      wildRows: v
        .wildFloors()
        .reverse()
        .map((x) => this.wildRow(x)),
      followed: followed && this.describeTender(followed),
      cameraFree: !this.cam.track,
      zoom: zoom < 1 ? "whole city" : `${zoom}×`,
      daysLeft: v.ready && v.lastDay ? Math.max(0, v.lastDay - v.day + 1) : null,
    };
  }

  private podCount() {
    return this.view.rooms.reduce(
      (n, f) =>
        n +
        (f.kind === "grand"
          ? Math.round((f.w * f.h) / 2)
          : f.kind === "atrium" || f.kind === "lagoon"
            ? 2
            : isWildKind(f.kind)
              ? 1
              : 0),
      0,
    );
  }

  private wildSealed() {
    const v = this.view;
    if (this.podCount() < 6 || v.wildSlots.length < 2) return false;
    const glass = [
      "dome",
      "atrium",
      "atriumpart",
      "marsh",
      "lagoon",
      "lagoonpart",
      "grand",
      "grandpart",
    ];
    return v.wildSlots.every((s) => {
      const t = v.M(s, v.heightOf(s));
      return !!t && glass.includes(t.kind);
    });
  }

  private wildStage() {
    const v = this.view;
    const floors = v.wildFloors();
    const species = SPECIES_ORDER.filter((k) => floors.reduce((n, f) => n + f[k], 0) >= 1).length;
    const pods = this.podCount();
    const slots = v.wildSlots;
    if (!slots.length)
      return "The council dreams of a sealed wild: glass pods and tubes where plants, creatures, and harvests hold each other in balance.";
    if (pods < 6 || slots.length < 2)
      return `Growing the Wild on tower${slots.length > 1 ? "s" : ""} ${slots.map((x) => x - 1).join(" & ")}: ${pods}/6 pods, ${slots.length}/2 columns, ${species} species.`;
    if (!this.wildSealed())
      return `${pods} pods, ${species} species. Waiting for sky domes to seal every column.`;
    if (v.wildAchieved)
      return `The Wild holds — ${v.wildDays.toFixed(1)} days in balance, ${species} species.`;
    return `Sealed, ${species} species. Nearly every pod must stay in balance with at least 3 species: ${v.wildDays.toFixed(1)} / 3 days.`;
  }

  private wildRow(x: Room): WildRow {
    const status = floorStatus(x);
    const pct = (n: number) => Math.round(n * 100);
    const label =
      x.kind === "grand"
        ? `grand ${x.tier} ${pct(x.canopy)}%`
        : x.kind === "atrium"
          ? `atrium ${pct(x.canopy)}%`
          : x.kind === "lagoon"
            ? `tide ${pct(x.level)}%`
            : x.kind === "marsh"
              ? `marsh ${pct(Math.min(1, x.level))}%`
              : `${lvName(x.L)} t${x.s - 1}`;
    return {
      key: `${x.s},${x.L}`,
      label,
      balanced: status === "balanced",
      plants: Math.round(x.plants),
      creatures: SPECIES_ORDER.filter((k) => x[k] >= 0.5).map((k) => ({
        color: SPECIES[k].c,
        count: Math.round(x[k]),
      })),
      note: `${status}${x.water < 0.3 ? ", thirsty" : ""}${x.fert > 0.6 ? ", rich soil" : ""}`,
    };
  }

  private describeTender(a: Agent): Followed {
    const home = a.home
      ? `${a.home.kind === "cottage" ? "lives in an atrium cottage on " : "lives on "}${lvName(a.home.L)}`
      : "sleeps by the hub";
    const doing =
      a.state === "walk"
        ? a.climbing
          ? a.climbing === 3
            ? "riding the hoist"
            : "riding up"
          : "heading somewhere"
        : a.state;
    return {
      name: a.name,
      about: `${a.hobby ? a.hobby + ", " : ""}${home}${a.close.length ? ", close to " + a.close.join(" & ") : ""}`,
      thought: a.thought || "...",
      bars: {
        energy: a.energy,
        joy: a.joy,
        curious: a.cur * 100,
        chatty: a.soc * 100,
        diligent: a.dil * 100,
        whimsy: a.whim * 100,
      },
      doing: `${doing} on ${lvName(a.L)}${a.carry ? `, carrying ${a.carry}` : ""}`,
    };
  }
}
