// Geometry, palettes and the catalogue of rooms, as in the original Sunhollow page.
// The simulation itself runs on the server; these are what the drawing code needs.

export const SLOTS = 14,
  SW = 40,
  MH = 32,
  LEVELS = 26,
  DEPTH = 6,
  W = 320,
  H = 480,
  WW = SLOTS * SW,
  SY = 96 + LEVELS * MH + 16,
  WH = SY + 16 + DEPTH * MH + 8;
export const CITY = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const HUB = [6, 7];
export const HX = HUB[0] * SW;
export const STREET = [
  "grove",
  "grove",
  "plaza",
  "plaza",
  "rubble",
  "plaza",
  "hub",
  "hub",
  "plaza",
  "rubble",
  "plaza",
  "plaza",
  "rubble",
  "rubble",
];

export const PAL: Record<string, string> = {
  k: "#1c1a2e",
  w: "#e9dcc0",
  y: "#f2c14e",
  Y: "#e29a2a",
  o: "#d98b3a",
  O: "#a9662a",
  r: "#e0563f",
  m: "#d64f9b",
  h: "#f2a5cb",
  c: "#6be3d9",
  C: "#2a7f8e",
  g: "#2f7a44",
  G: "#1e4a2b",
  l: "#6fbf73",
  t: "#8a5a34",
  T: "#4a2f1b",
  s: "#b3c3c6",
  S: "#6f8487",
  d: "#a17a4a",
  D: "#7a5a34",
  b: "#57c5d6",
  B: "#2f8fa6",
  p: "#6b3d8f",
  a: "#c9b08a",
  A: "#8f7a5a",
  x: "#cdeff5",
  i: "#c46d3b",
  n: "#d9cbae",
  N: "#c7b797",
  u: "#3b5a66",
  U: "#2c4550",
};
export const C = {
  sun: "#f2c14e",
  cyan: "#6be3d9",
  magenta: "#d64f9b",
  cream: "#f5e9c9",
  leaf: "#2f7a44",
  leafD: "#1e4a2b",
  leafL: "#6fbf73",
  metal: "#c46d3b",
  scrap: "#c9b08a",
  night: "#1c1a2e",
  water: "#57c5d6",
  waterD: "#2f8fa6",
  stone: "#b3c3c6",
  stoneD: "#6f8487",
  copper: "#c46d3b",
  trunk: "#8a5a34",
  rock: "#7a5a34",
  rockD: "#4a2f1b",
  rockL: "#a17a4a",
};

/** Creatures of the Wild, in the order the server sends their counts. */
export const SPECIES_ORDER = [
  "moth",
  "frog",
  "finch",
  "heron",
  "goat",
  "minnow",
  "pike",
  "crab",
] as const;
export type SpeciesName = (typeof SPECIES_ORDER)[number];
export const SPECIES: Record<SpeciesName, { c: string; n: string }> = {
  moth: { c: "#f2c14e", n: "moths" },
  frog: { c: "#6fbf73", n: "frogs" },
  finch: { c: "#e37bb6", n: "finches" },
  heron: { c: "#6be3d9", n: "herons" },
  goat: { c: "#e9dcc0", n: "moss-goats" },
  minnow: { c: "#9fd8e8", n: "minnows" },
  pike: { c: "#c47bd9", n: "pike" },
  crab: { c: "#e0563f", n: "crabs" },
};
export const GRAND_NAMES = [
  "the Canopy Hall",
  "the Cloud Terraces",
  "the Hanging Gardens",
  "the Great Atrium of Sunhollow",
];

export interface Building {
  name: string;
  blurb: string;
  cost: { metal: number; leaf: number; light: number };
  work: number;
  conn?: boolean;
  cap?: boolean;
  bridge?: boolean;
  hidden?: boolean;
  below?: boolean;
  hall?: boolean;
  marsh?: boolean;
  lagoon?: boolean;
  cottage?: boolean;
  grand?: boolean;
  atrium?: boolean;
  minL?: number;
  minD?: number;
}

export const BLD: Record<string, Building> = {
  hall: {
    name: "Supper hall",
    blurb:
      "Two rooms wide: a long table, a kitchen, lanterns. Every dusk the whole town eats here.",
    cost: { metal: 4, leaf: 4, light: 0 },
    work: 18,
    hall: true,
  },
  hallpart: {
    name: "Supper hall",
    blurb: "Part of the supper hall.",
    cost: { metal: 0, leaf: 0, light: 0 },
    work: 0,
    hidden: true,
  },
  stairs: {
    name: "Stairwell",
    blurb: "Cheap way up one floor.",
    cost: { metal: 3, leaf: 1, light: 0 },
    work: 10,
    conn: true,
  },
  lift: {
    name: "Lift shaft",
    blurb: "A humming car that carries tenders up.",
    cost: { metal: 5, leaf: 0, light: 3 },
    work: 16,
    conn: true,
  },
  home: {
    name: "Pod home",
    blurb: "Room for two. Grows vines with age.",
    cost: { metal: 3, leaf: 5, light: 2 },
    work: 20,
  },
  solar: {
    name: "Solar loft",
    blurb: "Panel ceiling. Makes more light the higher it sits.",
    cost: { metal: 4, leaf: 2, light: 0 },
    work: 14,
  },
  garden: {
    name: "Hydro garden",
    blurb: "Racks of greens fed by the rain lines.",
    cost: { metal: 1, leaf: 4, light: 0 },
    work: 12,
  },
  workshop: {
    name: "Workshop",
    blurb: "Faster building, reclaims metal.",
    cost: { metal: 6, leaf: 1, light: 3 },
    work: 24,
  },
  wind: {
    name: "Wind loft",
    blurb: "A big fan. Only worth it up high.",
    cost: { metal: 5, leaf: 0, light: 2 },
    work: 16,
    minL: 3,
  },
  tank: {
    name: "Cistern",
    blurb: "Holds 30 more rain.",
    cost: { metal: 5, leaf: 0, light: 1 },
    work: 16,
  },
  turbine: {
    name: "Hydro turbine",
    blurb: "Turns routed water into light.",
    cost: { metal: 6, leaf: 0, light: 2 },
    work: 20,
  },
  market: {
    name: "Night market",
    blurb: "Lanterns, stalls, gossip, a little of everything.",
    cost: { metal: 3, leaf: 3, light: 2 },
    work: 18,
  },
  bath: {
    name: "Bathhouse",
    blurb: "Where tired tenders go to glow.",
    cost: { metal: 4, leaf: 4, light: 4 },
    work: 26,
  },
  library: {
    name: "Story loft",
    blurb: "Books and cushions. Travellers hear about it.",
    cost: { metal: 6, leaf: 6, light: 5 },
    work: 30,
  },
  bridge: {
    name: "Skybridge",
    blurb: "Links two towers. Best sunbathing spot.",
    cost: { metal: 4, leaf: 2, light: 0 },
    work: 12,
    bridge: true,
  },
  catcher: {
    name: "Rain catcher",
    blurb: "Caps a tower with a funnel. Fills the cisterns.",
    cost: { metal: 4, leaf: 1, light: 0 },
    work: 12,
    cap: true,
    minL: 2,
  },
  dome: {
    name: "Sky dome",
    blurb: "Caps a tower with a glass grove.",
    cost: { metal: 5, leaf: 6, light: 2 },
    work: 22,
    cap: true,
    minL: 3,
  },
  beacon: {
    name: "Beacon spire",
    blurb: "Caps a tower. Calls travellers from afar.",
    cost: { metal: 8, leaf: 8, light: 8 },
    work: 40,
    cap: true,
    minL: 4,
  },
  wild: {
    name: "Wild floor",
    blurb: "A sealed glass floor of the Wild Stack. Plants, creatures, and careful harvests.",
    cost: { metal: 4, leaf: 3, light: 1 },
    work: 16,
    conn: true,
  },
  marsh: {
    name: "Marsh pod",
    blurb:
      "An open-topped wild pod. Reeds, frogs, and a channel that sends its rain down to the tide atrium.",
    cost: { metal: 3, leaf: 4, light: 0 },
    work: 14,
    conn: true,
    cap: true,
    marsh: true,
  },
  lagoon: {
    name: "Tide atrium",
    blurb:
      "A sealed glass tank fed by the marsh channels. Kelp, minnows, pike, crabs. Fish and seaweed are harvested from the gallery below.",
    cost: { metal: 12, leaf: 6, light: 6 },
    work: 50,
    conn: true,
    lagoon: true,
  },
  lagoonpart: {
    name: "Tide atrium",
    blurb: "Part of the tide atrium.",
    cost: { metal: 0, leaf: 0, light: 0 },
    work: 0,
    conn: true,
    hidden: true,
  },
  battery: {
    name: "Battery loft",
    blurb: "Stores 40 more light. Without batteries, spare light spills away as glow.",
    cost: { metal: 5, leaf: 0, light: 2 },
    work: 16,
  },
  apiary: {
    name: "Bee loft",
    blurb: "Hives. Bees pollinate every garden in the column and make a little honey.",
    cost: { metal: 2, leaf: 5, light: 0 },
    work: 14,
  },
  loom: {
    name: "Weaver's loft",
    blurb: "Dyes and looms. Tenders start turning up in scarves.",
    cost: { metal: 3, leaf: 6, light: 2 },
    work: 18,
  },
  cable: {
    name: "Cable station",
    blurb: "A gondola line to the nearest other station. A shortcut across the sky.",
    cost: { metal: 8, leaf: 1, light: 3 },
    work: 22,
    minL: 3,
  },
  aviary: {
    name: "Aviary",
    blurb: "Breeds finches and herons and lets them loose in the Wild.",
    cost: { metal: 4, leaf: 6, light: 2 },
    work: 20,
  },
  mistnet: {
    name: "Mist nets",
    blurb: "Caps a tower with fog nets. Pulls water out of the air, rain or not.",
    cost: { metal: 4, leaf: 2, light: 0 },
    work: 12,
    cap: true,
    minL: 3,
  },
  belltower: {
    name: "Bell tower",
    blurb: "Caps a tower. Rings the whole town down to the hub every third dawn.",
    cost: { metal: 6, leaf: 2, light: 2 },
    work: 24,
    cap: true,
    minL: 4,
  },
  pier: {
    name: "Sky pier",
    blurb: "Caps a tower with an airship mooring. Airships come oftener and trade twice.",
    cost: { metal: 9, leaf: 3, light: 4 },
    work: 30,
    cap: true,
    minL: 5,
  },
  observatory: {
    name: "Observatory",
    blurb: "Caps a tower with a telescope dome. Stargazers gather; comets get noticed.",
    cost: { metal: 8, leaf: 2, light: 6 },
    work: 32,
    cap: true,
    minL: 6,
  },
  foundry: {
    name: "Foundry",
    blurb: "Deep smelter. Every ore trip yields an extra metal. Sips light.",
    cost: { metal: 7, leaf: 0, light: 4 },
    work: 24,
    below: true,
    minD: 2,
  },
  cottage: {
    name: "Atrium cottage",
    blurb: "A little glowing cottage on an atrium terrace. Room for two, under the leaves.",
    cost: { metal: 2, leaf: 4, light: 1 },
    work: 12,
    cottage: true,
  },
  grand: {
    name: "Grand atrium",
    blurb:
      "A many-storey glass hall with terraces, a great tree, and a waterfall. Each one the council raises is bigger than the last.",
    cost: { metal: 18, leaf: 20, light: 10 },
    work: 80,
    conn: true,
    grand: true,
  },
  grandpart: {
    name: "Grand atrium",
    blurb: "Part of a grand atrium.",
    cost: { metal: 0, leaf: 0, light: 0 },
    work: 0,
    conn: true,
    hidden: true,
  },
  atrium: {
    name: "Cedar atrium",
    blurb: "A three-storey glass hall in the Wild. Cedars grow slow, finches nest, herons roost.",
    cost: { metal: 14, leaf: 16, light: 8 },
    work: 60,
    conn: true,
    atrium: true,
  },
  atriumpart: {
    name: "Cedar atrium",
    blurb: "Part of the cedar atrium.",
    cost: { metal: 0, leaf: 0, light: 0 },
    work: 0,
    conn: true,
    hidden: true,
  },
  mineshaft: {
    name: "Mine shaft",
    blurb: "Ladders and a hoist, sunk one level deeper.",
    cost: { metal: 4, leaf: 0, light: 1 },
    work: 14,
    conn: true,
    below: true,
  },
  gallery: {
    name: "Ore gallery",
    blurb: "Veins of metal. Empties into a mushroom cave.",
    cost: { metal: 2, leaf: 0, light: 1 },
    work: 12,
    below: true,
  },
  cave: {
    name: "Mushroom cave",
    blurb: "A spent gallery, gone soft and glowing.",
    cost: { metal: 0, leaf: 0, light: 0 },
    work: 0,
    below: true,
    hidden: true,
  },
  pump: {
    name: "Ground pump",
    blurb: "Draws water up from the deep. Sips light.",
    cost: { metal: 5, leaf: 0, light: 2 },
    work: 18,
    below: true,
    minD: 2,
  },
  geo: {
    name: "Geothermal tap",
    blurb: "Heat from below, light for above.",
    cost: { metal: 7, leaf: 0, light: 3 },
    work: 26,
    below: true,
    minD: 3,
  },
};

export const modTop = (L: number) => (L > 0 ? SY - L * MH : SY + 16 + (-L - 1) * MH);
export const feetY = (L: number) => (L === 0 ? SY : modTop(L) + 29);
export const slotOf = (x: number) => Math.max(0, Math.min(SLOTS - 1, Math.floor(x / SW)));
export const isCity = (s: number) => s >= 2 && s < SLOTS;
export const lvName = (L: number) => (L > 0 ? "floor " + L : L < 0 ? "depth " + -L : "the street");
export const isWildKind = (k: string) =>
  k === "wild" || k === "atrium" || k === "marsh" || k === "lagoon" || k === "grand";
export const capOffset = (k: string) =>
  k === "beacon" ? -8 : k === "catcher" ? 4 : k === "dome" ? 2 : 0;
export function levelAt(wy: number) {
  if (wy >= SY - 16 && wy < SY + 16) return 0;
  if (wy < SY - 16) {
    const L = Math.floor((SY - wy) / MH) + 1;
    return L > LEVELS ? 99 : L;
  }
  const D = Math.floor((wy - SY - 16) / MH) + 1;
  return D > DEPTH ? 99 : -D;
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const rint = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
