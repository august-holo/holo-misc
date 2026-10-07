use serde::Serialize;

// World geometry, in the pixel units the renderer draws with.
pub const SLOTS: i32 = 14;
pub const SW: f64 = 40.0;
pub const MH: f64 = 32.0;
pub const LEVELS: i32 = 26;
pub const DEPTH: i32 = 6;
pub const WW: f64 = SLOTS as f64 * SW;
pub const SY: f64 = 96.0 + LEVELS as f64 * MH + 16.0;
pub const CITY: std::ops::Range<i32> = 2..SLOTS;
pub const GROVE: [i32; 2] = [0, 1];
pub const HUB: [i32; 2] = [6, 7];
pub const HX: f64 = HUB[0] as f64 * SW;

pub const NAMES: [&str; 32] = [
    "Moss", "Pip", "Juniper", "Tallow", "Fennel", "Quill", "Bramble", "Sorrel", "Kettle", "Dill",
    "Lumen", "Wren", "Tansy", "Cobalt", "Fig", "Nettle", "Pebble", "Saffron", "Rook", "Clover",
    "Ash", "Marigold", "Tumble", "Ozone", "Bee", "Rye", "Onyx", "Puddle", "Vesper", "Halo",
    "Flint", "Ember",
];
pub const SHIRTS: [&str; 8] = [
    "#d64f9b", "#6be3d9", "#f2c14e", "#d98b3a", "#f5e9c9", "#8ad1ff", "#c47bd9", "#e0563f",
];
pub const HAIR: [&str; 7] = [
    "#2b1d16", "#f2c14e", "#f5e9c9", "#6b3d8f", "#d0432f", "#3e6b3f", "#c46d3b",
];
pub const SCARVES: [&str; 5] = ["#d64f9b", "#6be3d9", "#f2c14e", "#e0563f", "#b18cff"];
pub const DISHES: [&str; 7] = [
    "nettle soup and flatbread",
    "kelp fritters",
    "mushroom broth from the deep",
    "roast roots and moth-honey",
    "minnow stew",
    "rain tea and seed cake",
    "fern salad with crab",
];
pub const GRAND_NAMES: [&str; 4] = [
    "the Canopy Hall",
    "the Cloud Terraces",
    "the Hanging Gardens",
    "the Great Atrium of Sunhollow",
];
pub const STREET: [StreetKind; 14] = {
    use StreetKind::*;
    [
        Grove, Grove, Plaza, Plaza, Rubble, Plaza, Hub, Hub, Plaza, Rubble, Plaza, Plaza, Rubble,
        Rubble,
    ]
};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StreetKind {
    Grove,
    Plaza,
    Rubble,
    Hub,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Hall,
    HallPart,
    Stairs,
    Lift,
    Home,
    Solar,
    Garden,
    Workshop,
    Wind,
    Tank,
    Turbine,
    Market,
    Bath,
    Library,
    Bridge,
    Catcher,
    Dome,
    Beacon,
    Wild,
    Marsh,
    Lagoon,
    LagoonPart,
    Battery,
    Apiary,
    Loom,
    Cable,
    Aviary,
    Mistnet,
    Belltower,
    Pier,
    Observatory,
    Foundry,
    Cottage,
    Grand,
    GrandPart,
    Atrium,
    AtriumPart,
    Mineshaft,
    Gallery,
    Cave,
    Pump,
    Geo,
}

#[derive(Clone, Copy, Debug)]
pub struct Cost {
    pub metal: f64,
    pub leaf: f64,
    pub light: f64,
}

pub struct Def {
    pub name: &'static str,
    pub cost: Cost,
    pub work: f64,
    /// Tenders can climb through this room to the one beyond it.
    pub conn: bool,
    /// Nothing can be built on top.
    pub cap: bool,
    pub bridge: bool,
}

const fn def(name: &'static str, metal: f64, leaf: f64, light: f64, work: f64) -> Def {
    Def {
        name,
        cost: Cost { metal, leaf, light },
        work,
        conn: false,
        cap: false,
        bridge: false,
    }
}

const fn conn(d: Def) -> Def {
    Def { conn: true, ..d }
}

const fn cap(d: Def) -> Def {
    Def { cap: true, ..d }
}

impl Kind {
    pub fn def(self) -> Def {
        use Kind::*;
        match self {
            Hall => def("Supper hall", 4.0, 4.0, 0.0, 18.0),
            HallPart => def("Supper hall", 0.0, 0.0, 0.0, 0.0),
            Stairs => conn(def("Stairwell", 3.0, 1.0, 0.0, 10.0)),
            Lift => conn(def("Lift shaft", 5.0, 0.0, 3.0, 16.0)),
            Home => def("Pod home", 3.0, 5.0, 2.0, 20.0),
            Solar => def("Solar loft", 4.0, 2.0, 0.0, 14.0),
            Garden => def("Hydro garden", 1.0, 4.0, 0.0, 12.0),
            Workshop => def("Workshop", 6.0, 1.0, 3.0, 24.0),
            Wind => def("Wind loft", 5.0, 0.0, 2.0, 16.0),
            Tank => def("Cistern", 5.0, 0.0, 1.0, 16.0),
            Turbine => def("Hydro turbine", 6.0, 0.0, 2.0, 20.0),
            Market => def("Night market", 3.0, 3.0, 2.0, 18.0),
            Bath => def("Bathhouse", 4.0, 4.0, 4.0, 26.0),
            Library => def("Story loft", 6.0, 6.0, 5.0, 30.0),
            Bridge => Def {
                bridge: true,
                ..def("Skybridge", 4.0, 2.0, 0.0, 12.0)
            },
            Catcher => cap(def("Rain catcher", 4.0, 1.0, 0.0, 12.0)),
            Dome => cap(def("Sky dome", 5.0, 6.0, 2.0, 22.0)),
            Beacon => cap(def("Beacon spire", 8.0, 8.0, 8.0, 40.0)),
            Wild => conn(def("Wild floor", 4.0, 3.0, 1.0, 16.0)),
            Marsh => cap(conn(def("Marsh pod", 3.0, 4.0, 0.0, 14.0))),
            Lagoon => conn(def("Tide atrium", 12.0, 6.0, 6.0, 50.0)),
            LagoonPart => conn(def("Tide atrium", 0.0, 0.0, 0.0, 0.0)),
            Battery => def("Battery loft", 5.0, 0.0, 2.0, 16.0),
            Apiary => def("Bee loft", 2.0, 5.0, 0.0, 14.0),
            Loom => def("Weaver's loft", 3.0, 6.0, 2.0, 18.0),
            Cable => def("Cable station", 8.0, 1.0, 3.0, 22.0),
            Aviary => def("Aviary", 4.0, 6.0, 2.0, 20.0),
            Mistnet => cap(def("Mist nets", 4.0, 2.0, 0.0, 12.0)),
            Belltower => cap(def("Bell tower", 6.0, 2.0, 2.0, 24.0)),
            Pier => cap(def("Sky pier", 9.0, 3.0, 4.0, 30.0)),
            Observatory => cap(def("Observatory", 8.0, 2.0, 6.0, 32.0)),
            Foundry => def("Foundry", 7.0, 0.0, 4.0, 24.0),
            Cottage => def("Atrium cottage", 2.0, 4.0, 1.0, 12.0),
            Grand => conn(def("Grand atrium", 18.0, 20.0, 10.0, 80.0)),
            GrandPart => conn(def("Grand atrium", 0.0, 0.0, 0.0, 0.0)),
            Atrium => conn(def("Cedar atrium", 14.0, 16.0, 8.0, 60.0)),
            AtriumPart => conn(def("Cedar atrium", 0.0, 0.0, 0.0, 0.0)),
            Mineshaft => conn(def("Mine shaft", 4.0, 0.0, 1.0, 14.0)),
            Gallery => def("Ore gallery", 2.0, 0.0, 1.0, 12.0),
            Cave => def("Mushroom cave", 0.0, 0.0, 0.0, 0.0),
            Pump => def("Ground pump", 5.0, 0.0, 2.0, 18.0),
            Geo => def("Geothermal tap", 7.0, 0.0, 3.0, 26.0),
        }
    }

    pub fn is_wild(self) -> bool {
        matches!(
            self,
            Kind::Wild | Kind::Atrium | Kind::Marsh | Kind::Lagoon | Kind::Grand
        )
    }

    /// Secondary cell of a room that spans several cells.
    pub fn is_part(self) -> bool {
        matches!(
            self,
            Kind::AtriumPart | Kind::LagoonPart | Kind::HallPart | Kind::GrandPart
        )
    }

    pub fn lower_name(self) -> String {
        self.def().name.to_lowercase()
    }
}

/// Creature populations of a wild floor, indexed by `Species as usize`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Species {
    Moth,
    Frog,
    Finch,
    Heron,
    Goat,
    Minnow,
    Pike,
    Crab,
}
pub const SPECIES_COUNT: usize = 8;

/// The sliders of the original. Fixed at their defaults until viewers can interact.
pub struct Params {
    pub sun: f64,
    pub rain: f64,
    pub bustle: f64,
    pub cur: f64,
    pub soc: f64,
    pub climb: f64,
    pub homes: f64,
    pub gardens: f64,
    pub energy: f64,
    pub wonders: f64,
    pub depths: f64,
    pub wild: f64,
    pub harvest: f64,
    pub herding: f64,
    pub wgardens: f64,
    pub wforest: f64,
    pub wturbine: f64,
    pub wwild: f64,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            sun: 60.0,
            rain: 85.0,
            bustle: 100.0,
            cur: 50.0,
            soc: 50.0,
            climb: 60.0,
            homes: 50.0,
            gardens: 50.0,
            energy: 50.0,
            wonders: 30.0,
            depths: 50.0,
            wild: 50.0,
            harvest: 40.0,
            herding: 50.0,
            wgardens: 60.0,
            wforest: 40.0,
            wturbine: 30.0,
            wwild: 50.0,
        }
    }
}

pub fn mod_top(l: i32) -> f64 {
    if l > 0 {
        SY - l as f64 * MH
    } else {
        SY + 16.0 + (-l - 1) as f64 * MH
    }
}

pub fn feet_y(l: i32) -> f64 {
    if l == 0 { SY } else { mod_top(l) + 29.0 }
}

pub fn slot_of(x: f64) -> i32 {
    ((x / SW).floor() as i32).clamp(0, SLOTS - 1)
}

pub fn center(s: i32) -> f64 {
    s as f64 * SW + SW / 2.0
}

pub fn is_city(s: i32) -> bool {
    (2..SLOTS).contains(&s)
}

/// The level one step closer to the street.
pub fn toward(l: i32) -> i32 {
    l - l.signum()
}

pub fn lv_name(l: i32) -> String {
    match l {
        0 => "the street".into(),
        l if l > 0 => format!("floor {l}"),
        l => format!("depth {}", -l),
    }
}

/// JavaScript's Math.round: halves round up.
pub fn round(x: f64) -> f64 {
    (x + 0.5).floor()
}
