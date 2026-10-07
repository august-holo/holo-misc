// The browser's copy of the world. The server sends two kinds of snapshot:
// `world` (the city, every few seconds) and `frame` (what moves, five a second).
// This keeps the latest of each and blends between frames for smooth drawing.

import { CITY, DEPTH, LEVELS, SPECIES_ORDER, STREET, feetY, isWildKind, slotOf } from "./defs";

/** Must match PROTOCOL in the server's snapshot.rs. */
export const PROTOCOL = 1;

export interface Cedar {
  x: number;
  h: number;
  seed: number;
}

export interface Cottage {
  kind: "cottage";
  host: Room;
  lvl: number;
  s: number;
  L: number;
  x: number;
  seed: number;
  age: number;
}

/** One cell of the city. Street cells are rooms of kind "street" with a `sub`. */
export interface Room {
  kind: string;
  sub?: string;
  s: number;
  L: number;
  amt: number;
  water: number;
  age: number;
  seed: number;
  vines: number;
  plants: number;
  fert: number;
  moth: number;
  frog: number;
  finch: number;
  heron: number;
  goat: number;
  minnow: number;
  pike: number;
  crab: number;
  level: number;
  channel: boolean;
  tier: number;
  w: number;
  h: number;
  cedars: Cedar[];
  canopy: number;
  cottages: Cottage[];
  mural: { seed: number; theme: string } | null;
  glowvine: boolean;
  find: string | null;
  pair: Room | null;
  ref: Room | null;
}

export interface Project {
  id: number;
  kind: string;
  s: number;
  L: number;
  work: number;
  progress: number;
  funded: boolean;
  cells: { s: number; L: number }[] | null;
  host: Room | null;
  cx: number;
  w: number;
  h: number;
}

export interface Tree {
  x: number;
  size: number;
  amt: number;
}

export interface Agent {
  /** False until a frame has placed them. */
  placed: boolean;
  name: string;
  shirt: string;
  hair: string;
  hat: number;
  hobby: string | null;
  scarf: string | null;
  home: { L: number; kind: "cottage" | "home" } | null;
  thought: string;
  energy: number;
  joy: number;
  cur: number;
  soc: number;
  dil: number;
  whim: number;
  close: string[];
  px: number;
  py: number;
  s: number;
  L: number;
  state: string;
  face: number;
  climbing: number;
  carry: "leaf" | "metal" | null;
  leading: boolean;
  startled: number;
  musician: boolean;
  bowl: number;
  proj: number | null;
  /** Slot of the station a gondola rider is heading for. */
  ridingTo: number | null;
}

export interface Shooter {
  x: number;
  y: number;
  life: number;
}

export type Effect =
  | { fx: "built"; x: number; y: number }
  | { fx: "cottage"; x: number; y: number }
  | { fx: "wild" }
  | { fx: "celebrate" };

interface RoomMessage {
  kind: string;
  s: number;
  L: number;
  amt?: number;
  water: number;
  age: number;
  seed?: number;
  vines?: number;
  plants?: number;
  fert?: number;
  animals?: number[];
  level?: number;
  channel?: boolean;
  tier?: number;
  w?: number;
  h?: number;
  cedars?: Cedar[];
  canopy?: number;
  mural?: { seed: number; theme: string };
  glowvine?: boolean;
  find?: string;
  pair?: number;
  ref?: number;
}

interface AgentMessage {
  name: string;
  shirt: string;
  hair: string;
  hat: number;
  hobby?: string;
  scarf?: string;
  home?: [number, boolean];
  thought: string;
  energy: number;
  joy: number;
  traits: [number, number, number, number];
  close?: string[];
}

export interface WorldMessage {
  type: "world";
  v: number;
  run: number;
  lastDay: number;
  stock: [number, number, number, number];
  waterCap: number;
  lightCap: number;
  flow: [number, number, number, number, number];
  forestHealth: number;
  wildSlots: number[];
  wildDays: number;
  wildAchieved: boolean;
  marker: number | null;
  street: number[];
  trees: Tree[];
  rooms: RoomMessage[];
  projects: {
    id: number;
    kind: string;
    s: number;
    L: number;
    work: number;
    funded: boolean;
    cells?: [number, number][];
    host?: number;
    cx?: number;
    w?: number;
    h?: number;
  }[];
  cottages: { host: number; lvl: number; L: number; x: number; seed: number; age: number }[];
  agents: AgentMessage[];
  almanac: [number, string][];
  log: [number, string][];
}

type AgentFrame = [
  x: number,
  y: number,
  s: number,
  L: number,
  state: string,
  face: number,
  climbing: number,
  carry: number,
  flags: number,
  bowl: number,
  proj: number | null,
  ridingTo: number | null,
];

export interface FrameMessage {
  type: "frame";
  run: number;
  t: number;
  day: number;
  tod: number;
  rain: boolean;
  wind: number;
  flash: number;
  storm: number;
  blackout: number;
  supper: number;
  festival: number;
  bell: number;
  kite: boolean;
  spill: number;
  agents: AgentFrame[];
  progress: [number, number][];
  ship?: [number, number, number];
  cat: [number, number, number, string];
  fox: [number, number];
  birds?: [number, number, number];
  shooters?: [number, number, number, number, number][];
  fx?: Effect[];
}

const LEADING = 1,
  STARTLED = 2,
  MUSICIAN = 4;
const CARRY = [null, "leaf", "metal"] as const;

/** Frames are drawn this far behind the newest, so there is always a next one to blend towards. */
const DELAY = 0.3;
/** A tender that moved further than this between frames was placed, not walked. */
const SNAP = 48;
const KEPT_FRAMES = 8;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function streetCell(s: number, amt: number): Room {
  return { ...blankRoom("street", s, 0), sub: STREET[s], amt };
}

function blankRoom(kind: string, s: number, L: number): Room {
  return {
    kind,
    s,
    L,
    amt: 0,
    water: 1,
    age: 0,
    seed: 0,
    vines: 0,
    plants: 0,
    fert: 0,
    moth: 0,
    frog: 0,
    finch: 0,
    heron: 0,
    goat: 0,
    minnow: 0,
    pike: 0,
    crab: 0,
    level: 0,
    channel: false,
    tier: 0,
    w: 0,
    h: 0,
    cedars: [],
    canopy: 0,
    cottages: [],
    mural: null,
    glowvine: false,
    find: null,
    pair: null,
    ref: null,
  };
}

function blankAgent(): Agent {
  return {
    placed: false,
    name: "…",
    shirt: "#f5e9c9",
    hair: "#2b1d16",
    hat: 0,
    hobby: null,
    scarf: null,
    home: null,
    thought: "",
    energy: 0,
    joy: 0,
    cur: 0,
    soc: 0,
    dil: 0,
    whim: 0,
    close: [],
    px: 0,
    py: feetY(0),
    s: 0,
    L: 0,
    state: "idle",
    face: 1,
    climbing: 0,
    carry: null,
    leading: false,
    startled: 0,
    musician: false,
    bowl: 0,
    proj: null,
    ridingTo: null,
  };
}

export class View {
  run = 0;
  /** True once both a world and a frame have arrived. */
  ready = false;
  lastDay = 0;

  mods: Record<number, Record<number, Room>> = {};
  /** Every room above or below the street. */
  rooms: Room[] = [];
  street: Room[] = STREET.map((_, s) => streetCell(s, 0));
  trees: Tree[] = [];
  projects: Project[] = [];
  agents: Agent[] = [];
  cottages: Cottage[] = [];
  stock = { light: 0, leaf: 0, metal: 0, water: 0 };
  waterCap = 20;
  lightCap = 30;
  flow = { inflow: 0, gardens: 0, forest: 0, turbine: 0, wild: 0 };
  forestHealth = 0.8;
  wildSlots: number[] = [];
  wildDays = 0;
  wildAchieved = false;
  marker: number | null = null;
  almanac: { day: number; t: string }[] = [];
  log: { n: number; t: string }[] = [];

  simTime = 0;
  day = 1;
  tod = 0.22;
  rainNow = false;
  wind = -14;
  flash = 0;
  storm = 0;
  blackout = 0;
  supper = 0;
  festival = 0;
  bell = 0;
  kiteDay = false;
  spill = 0;
  ship = { active: false, x: 0, y: 0, phase: 0 };
  cat = { x: 0, y: 0, dir: 1, state: "sit" };
  fox = { x: 30, dir: 1 };
  birds: { x: number; y: number; t: number } | null = null;
  shooters: Shooter[] = [];

  private frames: FrameMessage[] = [];
  private hasWorld = false;
  /** Server time minus local time, from the promptest frame seen lately. */
  private offset: number | null = null;

  constructor() {
    this.rebuildGrid();
  }

  private reset(run: number) {
    Object.assign(this, new View());
    this.run = run;
  }

  M(s: number, L: number): Room | null {
    return s >= 0 && s < STREET.length ? (this.mods[s]?.[L] ?? null) : null;
  }

  heightOf(s: number) {
    let h = 0;
    for (let L = 1; L <= LEVELS; L++) if (this.M(s, L)) h = L;
    return h;
  }

  depthOf(s: number) {
    let d = 0;
    for (let L = -1; L >= -DEPTH; L--) if (this.M(s, L)) d = -L;
    return d;
  }

  cityHeight() {
    return Math.max(...CITY.map((s) => this.heightOf(s)));
  }

  cityDepth() {
    return Math.max(...CITY.map((s) => this.depthOf(s)));
  }

  find(kind: string) {
    return this.rooms.find((m) => m.kind === kind) ?? null;
  }

  /** Wild floors from the lowest up. */
  wildFloors() {
    return this.rooms.filter((m) => isWildKind(m.kind)).sort((a, b) => a.L - b.L || a.s - b.s);
  }

  capacity() {
    return 4 + this.rooms.filter((b) => b.kind === "home").length * 2 + this.cottages.length * 2;
  }

  daylight() {
    return Math.max(0, Math.sin(this.tod * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
  }

  private rebuildGrid() {
    this.mods = {};
    for (const st of this.street) this.mods[st.s] = { 0: st };
    for (const r of this.rooms) this.mods[r.s][r.L] = r;
  }

  applyWorld(m: WorldMessage) {
    if (m.run !== this.run) this.reset(m.run);
    this.hasWorld = true;
    this.lastDay = m.lastDay;

    const rooms = m.rooms.map((r): Room => {
      const room: Room = {
        ...blankRoom(r.kind, r.s, r.L),
        amt: r.amt ?? 0,
        water: r.water,
        age: r.age,
        seed: r.seed ?? 0,
        vines: r.vines ?? 0,
        plants: r.plants ?? 0,
        fert: r.fert ?? 0,
        level: r.level ?? 0,
        channel: r.channel ?? false,
        tier: r.tier ?? 0,
        w: r.w ?? 0,
        h: r.h ?? 0,
        cedars: r.cedars ?? [],
        canopy: r.canopy ?? 0,
        mural: r.mural ?? null,
        glowvine: r.glowvine ?? false,
        find: r.find ?? null,
      };
      SPECIES_ORDER.forEach((name, i) => (room[name] = r.animals?.[i] ?? 0));
      return room;
    });
    m.rooms.forEach((r, i) => {
      if (r.pair != null) rooms[i].pair = rooms[r.pair];
      if (r.ref != null) rooms[i].ref = rooms[r.ref];
    });
    this.rooms = rooms;
    this.cottages = m.cottages.map((c) => {
      const cottage: Cottage = {
        kind: "cottage",
        host: rooms[c.host],
        lvl: c.lvl,
        s: slotOf(c.x),
        L: c.L,
        x: c.x,
        seed: c.seed,
        age: c.age,
      };
      cottage.host.cottages.push(cottage);
      return cottage;
    });
    this.street = m.street.map((amt, s) => streetCell(s, amt));
    this.rebuildGrid();

    const progress = new Map(this.projects.map((p) => [p.id, p.progress]));
    this.projects = m.projects.map((p) => ({
      id: p.id,
      kind: p.kind,
      s: p.s,
      L: p.L,
      work: p.work,
      progress: progress.get(p.id) ?? 0,
      funded: p.funded,
      cells: p.cells ? p.cells.map(([s, L]) => ({ s, L })) : null,
      host: p.host != null ? rooms[p.host] : null,
      cx: p.cx ?? 0,
      w: p.w ?? 0,
      h: p.h ?? 0,
    }));

    m.agents.forEach((a, i) => {
      const agent = (this.agents[i] ??= blankAgent());
      agent.name = a.name;
      agent.shirt = a.shirt;
      agent.hair = a.hair;
      agent.hat = a.hat;
      agent.hobby = a.hobby ?? null;
      agent.scarf = a.scarf ?? null;
      agent.home = a.home ? { L: a.home[0], kind: a.home[1] ? "cottage" : "home" } : null;
      agent.thought = a.thought;
      agent.energy = a.energy;
      agent.joy = a.joy;
      [agent.cur, agent.soc, agent.dil, agent.whim] = a.traits.map((t) => t / 100);
      agent.close = a.close ?? [];
    });

    this.trees = m.trees;
    [this.stock.light, this.stock.leaf, this.stock.metal, this.stock.water] = m.stock;
    this.waterCap = m.waterCap;
    this.lightCap = m.lightCap;
    const f = this.flow;
    [f.inflow, f.gardens, f.forest, f.turbine, f.wild] = m.flow;
    this.forestHealth = m.forestHealth;
    this.wildSlots = m.wildSlots;
    this.wildDays = m.wildDays;
    this.wildAchieved = m.wildAchieved;
    this.marker = m.marker;
    this.almanac = m.almanac.map(([day, t]) => ({ day, t }));
    this.log = m.log.map(([n, t]) => ({ n, t }));
    this.ready = this.frames.length > 0;
  }

  /** Returns the effects the frame carried, to be shown once. */
  applyFrame(m: FrameMessage, now: number): Effect[] {
    if (m.run !== this.run) {
      // A frame from a world we have not been shown yet; its city follows shortly.
      if (this.hasWorld) this.reset(m.run);
      else this.run = m.run;
    }
    const sample = m.t - now;
    // Frames that arrive late must not drag the clock back; forget a good sample slowly.
    this.offset = this.offset === null ? sample : Math.max(sample, this.offset - 0.002);
    this.frames.push(m);
    if (this.frames.length > KEPT_FRAMES) this.frames.shift();
    this.ready = this.hasWorld;
    return m.fx ?? [];
  }

  /** Brings everything that moves to where it was at the moment now being drawn. */
  sample(now: number) {
    const frames = this.frames;
    if (!frames.length || this.offset === null) return;
    const newest = frames[frames.length - 1];
    const t = Math.min(now + this.offset - DELAY, newest.t);

    let i = frames.length - 1;
    while (i > 0 && frames[i - 1].t >= t) i--;
    const b = frames[i];
    const a = frames[Math.max(0, i - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
    const near = k < 0.5 ? a : b;

    this.simTime = Math.max(a.t, t);
    this.day = near.day;
    this.tod = lerp(a.tod, b.tod < a.tod ? b.tod + 1 : b.tod, k) % 1;
    this.rainNow = near.rain;
    this.wind = near.wind;
    this.flash = lerp(a.flash, b.flash, k);
    this.storm = near.storm;
    this.blackout = near.blackout;
    this.supper = near.supper;
    this.festival = near.festival;
    this.bell = near.bell;
    this.kiteDay = near.kite;
    this.spill = lerp(a.spill, b.spill, k);

    b.agents.forEach((to, n) => {
      const agent = (this.agents[n] ??= blankAgent());
      const from = a.agents[n] ?? to;
      const walked = Math.hypot(to[0] - from[0], to[1] - from[1]) <= SNAP;
      agent.px = walked ? lerp(from[0], to[0], k) : to[0];
      agent.py = walked ? lerp(from[1], to[1], k) : to[1];
      const d = (near.agents[n] ?? to) as AgentFrame;
      agent.s = d[2];
      agent.L = d[3];
      agent.state = d[4];
      agent.face = d[5];
      agent.climbing = d[6];
      agent.carry = CARRY[d[7]] ?? null;
      agent.leading = (d[8] & LEADING) !== 0;
      agent.startled = d[8] & STARTLED ? 1 : 0;
      agent.musician = (d[8] & MUSICIAN) !== 0;
      agent.bowl = d[9];
      agent.proj = d[10];
      agent.ridingTo = d[11];
      agent.placed = true;
    });

    for (const [id, progress] of b.progress) {
      const p = this.projects.find((p) => p.id === id);
      if (p) p.progress = progress;
    }

    const ship = b.ship;
    if (ship) {
      const from = a.ship ?? ship;
      this.ship = {
        active: true,
        x: lerp(from[0], ship[0], k),
        y: lerp(from[1], ship[1], k),
        phase: ship[2],
      };
    } else this.ship.active = false;

    this.cat = {
      x: lerp(a.cat[0], b.cat[0], k),
      y: b.cat[1],
      dir: near.cat[2],
      state: near.cat[3],
    };
    this.fox = { x: lerp(a.fox[0], b.fox[0], k), dir: near.fox[1] };
    this.birds = b.birds
      ? {
          x: lerp((a.birds ?? b.birds)[0], b.birds[0], k),
          y: b.birds[1],
          t: lerp((a.birds ?? b.birds)[2], b.birds[2], k),
        }
      : null;
    // Falling stars are quick; carry each on from where the earlier frame saw it.
    const since = Math.max(0, t - a.t);
    this.shooters = (a.shooters ?? [])
      .map(([x, y, vx, vy, life]) => ({
        x: x + vx * since,
        y: y + vy * since,
        life: life - since,
      }))
      .filter((s) => s.life > 0);
  }
}
