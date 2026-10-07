use std::collections::VecDeque;

use super::defs::*;
use super::rng::Rng;

pub type RoomId = usize;
pub type AgentId = usize;
pub type Node = (i32, i32);

const LEVEL_SPAN: usize = (LEVELS + DEPTH + 1) as usize;
const ALMANAC_LEN: usize = 16;
const LOG_LEN: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Cell {
    Street,
    Room(RoomId),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Find {
    Geode,
    Spring,
    Relic,
    Fossil,
}

pub struct Cedar {
    pub x: f64,
    pub h: f64,
    pub seed: f64,
}

pub struct Mural {
    pub seed: f64,
    pub theme: &'static str,
}

/// One cell of the city grid. Rooms that span several cells have one main room
/// and `*Part` rooms pointing back at it through `main`.
pub struct Room {
    pub kind: Kind,
    pub s: i32,
    pub l: i32,
    pub amt: i32,
    pub grow: f64,
    pub water: f64,
    pub age: f64,
    pub seed: f64,
    pub vines: i32,
    pub plants: f64,
    pub fert: f64,
    pub animals: [f64; SPECIES_COUNT],
    pub level: f64,
    pub harvested: f64,
    pub channel: bool,
    pub cells: Vec<Node>,
    pub tier: i32,
    pub w: i32,
    pub h: i32,
    pub cedars: Vec<Cedar>,
    pub canopy: f64,
    pub cottages: Vec<usize>,
    pub mural: Option<Mural>,
    pub glowvine: bool,
    pub find: Option<Find>,
    pub pair: Option<RoomId>,
    pub main: Option<RoomId>,
    pub solid: bool,
}

impl Room {
    pub fn new(kind: Kind, s: i32, l: i32, seed: f64) -> Self {
        Self {
            kind,
            s,
            l,
            amt: if kind == Kind::Gallery { 12 } else { 0 },
            grow: 0.0,
            water: 1.0,
            age: 0.0,
            seed,
            vines: 0,
            plants: if matches!(kind, Kind::Wild | Kind::Marsh) {
                25.0
            } else {
                0.0
            },
            fert: 0.3,
            animals: [0.0; SPECIES_COUNT],
            level: if kind == Kind::Marsh { 0.4 } else { 0.0 },
            harvested: 0.0,
            channel: false,
            cells: Vec::new(),
            tier: 0,
            w: 0,
            h: 0,
            cedars: Vec::new(),
            canopy: 0.0,
            cottages: Vec::new(),
            mural: None,
            glowvine: false,
            find: None,
            pair: None,
            main: None,
            solid: false,
        }
    }

    fn part(kind: Kind, s: i32, l: i32, main: RoomId, solid: bool) -> Self {
        Self {
            main: Some(main),
            solid,
            ..Self::new(kind, s, l, 0.0)
        }
    }

    pub fn n(&self, sp: Species) -> f64 {
        self.animals[sp as usize]
    }

    pub fn n_mut(&mut self, sp: Species) -> &mut f64 {
        &mut self.animals[sp as usize]
    }

    pub fn animal_total(&self) -> f64 {
        self.animals.iter().sum()
    }

    /// How many single pods this floor counts as, for creature carrying capacity.
    pub fn scale(&self) -> f64 {
        match self.kind {
            Kind::Grand => (self.w * self.h) as f64 / 2.5,
            Kind::Atrium | Kind::Lagoon => 2.2,
            _ => 1.0,
        }
    }

    pub fn status(&self) -> &'static str {
        use Species::*;
        if matches!(self.kind, Kind::Marsh | Kind::Lagoon) && self.level < 0.35 {
            return "low water";
        }
        if self.plants < 30.0 {
            return "bare";
        }
        if self.plants > 85.0 {
            return "overgrown";
        }
        let a = self.animal_total();
        if a < 2.0 {
            "quiet"
        } else if a > 14.0 * self.scale() {
            "swarming"
        } else if self.n(Goat) > 0.0 && self.plants < 40.0 {
            "overgrazed"
        } else {
            "balanced"
        }
    }
}

pub struct Street {
    pub sub: StreetKind,
    pub amt: i32,
    pub grow: f64,
}

pub struct Tree {
    pub x: f64,
    pub s: i32,
    pub size: i32,
    pub amt: i32,
    pub grow: f64,
}

pub struct Cottage {
    pub host: RoomId,
    pub cx: i32,
    pub lvl: i32,
    pub s: i32,
    pub l: i32,
    pub x: f64,
    pub seed: f64,
    pub age: f64,
}

pub struct Project {
    pub id: u32,
    pub kind: Kind,
    pub s: i32,
    pub l: i32,
    pub cost: Cost,
    pub work: f64,
    pub progress: f64,
    pub funded: bool,
    pub age: f64,
    pub cells: Vec<Node>,
    pub host: Option<RoomId>,
    pub cx: i32,
    pub lvl: i32,
    pub tier: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Home {
    Room(RoomId),
    Cottage(usize),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Resource {
    Leaf,
    Metal,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    Tree(usize),
    Rubble(i32),
    Room(RoomId),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hobby {
    Musician,
    Painter,
    Stargazer,
    Tinker,
    Birder,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Idle,
    Walk,
    Harvest,
    Deposit,
    Build,
    Herd1,
    Herd2,
    Tendg,
    Plant,
    Chat,
    Look,
    Sunbathe,
    Rest,
    Soak,
    Browse,
    Paint,
    Stargaze,
    Dine,
    Festival,
    Dance,
}

/// How a tender is currently moving between floors.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Climb {
    None = 0,
    Stairs = 1,
    Lift = 2,
    Hoist = 3,
    Gondola = 4,
}

pub struct Agent {
    pub name: String,
    pub s: i32,
    pub l: i32,
    pub px: f64,
    pub py: f64,
    pub path: VecDeque<Node>,
    pub state: State,
    pub next: State,
    pub arrive: bool,
    pub timer: f64,
    pub carry: Option<Resource>,
    pub carry_n: f64,
    pub energy: f64,
    pub joy: f64,
    pub cur: f64,
    pub soc: f64,
    pub dil: f64,
    pub whim: f64,
    pub shirt: &'static str,
    pub hair: &'static str,
    pub hat: i32,
    pub hobby: Option<Hobby>,
    pub scarf: Option<&'static str>,
    /// Chats had with each other tender, by their id.
    pub bond: Vec<u32>,
    pub paint_t: f64,
    pub home: Option<Home>,
    pub thought: &'static str,
    pub face: f64,
    pub startled: f64,
    pub dance: f64,
    pub climbing: Climb,
    pub leading: bool,
    pub bowl: i32,
    /// Where to stand once the path is walked; None means stop where you are.
    pub tx: Option<f64>,
    // Details of the errand in progress.
    pub proj: Option<u32>,
    pub work_t: f64,
    pub rest_t: f64,
    pub res: Resource,
    pub src: Option<Source>,
    pub garden: Option<RoomId>,
    pub herd_from: Option<RoomId>,
    pub herd_to: Option<RoomId>,
    pub buddy: Option<AgentId>,
}

#[derive(Default)]
pub struct Ship {
    pub active: bool,
    pub x: f64,
    pub y: f64,
    pub phase: i32,
    pub timer: f64,
    pub tx: f64,
    pub next_day: i32,
    pub gifts: i32,
    pub storm_day: i32,
    pub rang: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CatState {
    Sit,
    Walk,
    Sleep,
    Stretch,
}

pub struct Cat {
    pub x: f64,
    pub y: f64,
    pub dir: f64,
    pub t: f64,
    pub state: CatState,
}

pub struct Fox {
    pub x: f64,
    pub dir: f64,
    pub t: f64,
}

pub struct Birds {
    pub x: f64,
    pub y: f64,
    pub t: f64,
}

pub struct Shooter {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub life: f64,
}

#[derive(Default)]
pub struct Stock {
    pub light: f64,
    pub leaf: f64,
    pub metal: f64,
    pub water: f64,
}

#[derive(Default)]
pub struct Flow {
    pub inflow: f64,
    pub gardens: f64,
    pub forest: f64,
    pub turbine: f64,
    pub wild: f64,
}

/// Moments the renderer decorates with a burst of particles or a musical flourish.
pub enum Effect {
    /// A room was finished at this point.
    Built {
        x: f64,
        y: f64,
    },
    CottageBuilt {
        x: f64,
        y: f64,
    },
    /// The Wild held its balance; every wild floor celebrates.
    WildHolds,
    Celebrate,
}

pub struct World {
    pub rng: Rng,
    pub p: Params,
    pub grid: [[Option<RoomId>; LEVEL_SPAN]; SLOTS as usize],
    pub rooms: Vec<Room>,
    pub street: Vec<Street>,
    pub trees: Vec<Tree>,
    pub projects: Vec<Project>,
    pub next_project_id: u32,
    pub agents: Vec<Agent>,
    pub cottages: Vec<Cottage>,
    pub reach: [[bool; LEVEL_SPAN]; SLOTS as usize],

    pub stock: Stock,
    pub water_cap: f64,
    pub light_cap: f64,
    pub flow: Flow,
    pub forest_health: f64,

    pub sim_time: f64,
    pub ticks: u64,
    pub day: i32,
    pub tod: f64,
    pub rain_now: bool,
    pub rain_timer: f64,
    pub flash: f64,
    pub wind: f64,
    pub storm: f64,
    pub blackout: f64,
    pub spill: f64,
    pub bell: f64,
    pub supper: f64,
    pub supper_done: bool,
    pub festival: f64,
    pub festival_done: bool,
    pub kite_day: bool,
    pub scarf_t: f64,
    pub comet_t: f64,
    pub plan_timer: f64,
    pub arrival_timer: f64,
    pub marker: Option<i32>,

    pub wild_slots: Vec<i32>,
    pub balance_t: f64,
    pub wild_days: f64,
    pub wild_achieved: bool,
    pub goats_introduced: i32,

    pub ship: Ship,
    pub cat: Cat,
    pub fox: Fox,
    pub birds: Option<Birds>,
    pub shooters: Vec<Shooter>,

    pub almanac: VecDeque<(i32, String)>,
    /// Most recent log lines with a running sequence number.
    pub log: VecDeque<(u64, String)>,
    pub log_seq: u64,
    pub effects: Vec<Effect>,
    /// Set when the structure of the city changed, so viewers are told promptly.
    pub changed: bool,
}

fn level_index(l: i32) -> usize {
    (l + DEPTH) as usize
}

impl World {
    pub fn new(seed: u64) -> Self {
        let mut rng = Rng::new(seed);
        let street = STREET
            .iter()
            .map(|&sub| Street {
                sub,
                amt: if sub == StreetKind::Rubble { 7 } else { 0 },
                grow: 0.0,
            })
            .collect();
        let trees = (0..4)
            .map(|i| Tree {
                x: (8 + i * 20 + rng.int(0, 6)) as f64,
                s: if i < 2 { 0 } else { 1 },
                size: rng.int(1, 3),
                amt: rng.int(0, 2),
                grow: 0.0,
            })
            .collect();

        let mut world = Self {
            rng,
            p: Params::default(),
            grid: [[None; LEVEL_SPAN]; SLOTS as usize],
            rooms: Vec::new(),
            street,
            trees,
            projects: Vec::new(),
            next_project_id: 1,
            agents: Vec::new(),
            cottages: Vec::new(),
            reach: [[false; LEVEL_SPAN]; SLOTS as usize],
            stock: Stock {
                light: 6.0,
                leaf: 4.0,
                metal: 10.0,
                water: 8.0,
            },
            water_cap: 20.0,
            light_cap: 30.0,
            flow: Flow::default(),
            forest_health: 0.8,
            sim_time: 0.0,
            ticks: 0,
            day: 1,
            tod: 0.22,
            rain_now: true,
            rain_timer: 60.0,
            flash: 0.0,
            wind: -14.0,
            storm: 0.0,
            blackout: 0.0,
            spill: 0.0,
            bell: 0.0,
            supper: 0.0,
            supper_done: false,
            festival: 0.0,
            festival_done: false,
            kite_day: false,
            scarf_t: 200.0,
            comet_t: 0.0,
            plan_timer: 6.0,
            arrival_timer: 50.0,
            marker: None,
            wild_slots: Vec::new(),
            balance_t: 0.0,
            wild_days: 0.0,
            wild_achieved: false,
            goats_introduced: 0,
            ship: Ship {
                x: -80.0,
                next_day: 3,
                ..Ship::default()
            },
            cat: Cat {
                x: 0.0,
                y: 0.0,
                dir: 1.0,
                t: 0.0,
                state: CatState::Sit,
            },
            fox: Fox {
                x: 30.0,
                dir: 1.0,
                t: 0.0,
            },
            birds: None,
            shooters: Vec::new(),
            almanac: VecDeque::new(),
            log: VecDeque::new(),
            log_seq: 0,
            effects: Vec::new(),
            changed: true,
        };
        world.compute_reach();
        for _ in 0..5 {
            world.spawn_agent(false);
        }
        world.log(
            "Five tenders set up camp by the hub, hoods up against the rain. Sunhollow begins.",
        );
        world
    }

    // ---------- messages ----------

    pub fn log(&mut self, text: impl Into<String>) {
        self.log_seq += 1;
        self.log.push_back((self.log_seq, text.into()));
        while self.log.len() > LOG_LEN {
            self.log.pop_front();
        }
    }

    /// A log line worth remembering in the almanac.
    pub fn note(&mut self, text: impl Into<String>) {
        let text = text.into();
        self.almanac.push_front((self.day, text.clone()));
        self.almanac.truncate(ALMANAC_LEN);
        self.log(text);
    }

    // ---------- grid ----------

    pub fn cell(&self, s: i32, l: i32) -> Option<Cell> {
        if !(0..SLOTS).contains(&s) || !(-DEPTH..=LEVELS).contains(&l) {
            return None;
        }
        if l == 0 {
            return Some(Cell::Street);
        }
        self.grid[s as usize][level_index(l)].map(Cell::Room)
    }

    pub fn room_id_at(&self, s: i32, l: i32) -> Option<RoomId> {
        match self.cell(s, l) {
            Some(Cell::Room(id)) => Some(id),
            _ => None,
        }
    }

    pub fn room_at(&self, s: i32, l: i32) -> Option<&Room> {
        self.room_id_at(s, l).map(|id| &self.rooms[id])
    }

    pub fn kind_at(&self, s: i32, l: i32) -> Option<Kind> {
        self.room_at(s, l).map(|r| r.kind)
    }

    pub fn occupied(&self, s: i32, l: i32) -> bool {
        self.cell(s, l).is_some()
    }

    pub fn walkable(&self, s: i32, l: i32) -> bool {
        match self.cell(s, l) {
            Some(Cell::Street) => true,
            Some(Cell::Room(id)) => !self.rooms[id].solid,
            None => false,
        }
    }

    fn conn_at(&self, s: i32, l: i32) -> bool {
        self.kind_at(s, l).is_some_and(|k| k.def().conn)
    }

    pub fn place(&mut self, room: Room) -> RoomId {
        let id = self.rooms.len();
        self.grid[room.s as usize][level_index(room.l)] = Some(id);
        self.rooms.push(room);
        id
    }

    pub fn place_part(&mut self, kind: Kind, node: Node, main: RoomId, solid: bool) {
        self.place(Room::part(kind, node.0, node.1, main, solid));
    }

    /// The room a cell belongs to: itself, or the main room of a multi-cell one.
    pub fn main_of(&self, id: RoomId) -> RoomId {
        let room = &self.rooms[id];
        if room.kind.is_part() {
            room.main.unwrap_or(id)
        } else {
            id
        }
    }

    pub fn cells_of(&self, id: RoomId) -> Vec<Node> {
        let room = &self.rooms[id];
        if room.cells.is_empty() {
            vec![(room.s, room.l)]
        } else {
            room.cells.clone()
        }
    }

    pub fn height_of(&self, s: i32) -> i32 {
        (1..=LEVELS)
            .rev()
            .find(|&l| self.occupied(s, l))
            .unwrap_or(0)
    }

    pub fn depth_of(&self, s: i32) -> i32 {
        (1..=DEPTH)
            .rev()
            .find(|&d| self.occupied(s, -d))
            .unwrap_or(0)
    }

    pub fn city_height(&self) -> i32 {
        CITY.map(|s| self.height_of(s)).max().unwrap_or(0)
    }

    pub fn city_depth(&self) -> i32 {
        CITY.map(|s| self.depth_of(s)).max().unwrap_or(0)
    }

    pub fn count(&self, kind: Kind) -> usize {
        self.rooms.iter().filter(|r| r.kind == kind).count()
    }

    pub fn countf(&self, kind: Kind) -> f64 {
        self.count(kind) as f64
    }

    pub fn find_kind(&self, kind: Kind) -> Option<RoomId> {
        self.rooms.iter().position(|r| r.kind == kind)
    }

    /// Rooms of a kind that tenders can currently walk to.
    pub fn kinds_at(&self, kind: Kind) -> Vec<RoomId> {
        (0..self.rooms.len())
            .filter(|&id| {
                let r = &self.rooms[id];
                r.kind == kind && self.reachable(r.s, r.l)
            })
            .collect()
    }

    pub fn capacity(&self) -> usize {
        4 + self.count(Kind::Home) * 2 + self.cottages.len() * 2
    }

    pub fn daylight(&self) -> f64 {
        ((self.tod * std::f64::consts::TAU - std::f64::consts::FRAC_PI_2).sin() * 0.5 + 0.5)
            .max(0.0)
    }

    pub fn home_node(&self, home: Home) -> Node {
        match home {
            Home::Room(id) => (self.rooms[id].s, self.rooms[id].l),
            Home::Cottage(i) => (self.cottages[i].s, self.cottages[i].l),
        }
    }

    pub fn residents(&self, home: Home) -> usize {
        self.agents.iter().filter(|a| a.home == Some(home)).count()
    }

    // ---------- walking graph ----------

    fn linked(&self, s: i32, l1: i32, l2: i32) -> bool {
        let (closer, far) = if l1.abs() < l2.abs() {
            (l1, l2)
        } else {
            (l2, l1)
        };
        if !self.walkable(s, far) || !self.walkable(s, closer) {
            return false;
        }
        closer == 0 || self.conn_at(s, closer)
    }

    fn neighbours(&self, s: i32, l: i32) -> Vec<Node> {
        let mut out = Vec::with_capacity(5);
        if let Some(room) = self.room_at(s, l)
            && room.kind == Kind::Cable
            && let Some(pair) = room.pair
        {
            out.push((self.rooms[pair].s, self.rooms[pair].l));
        }
        if self.walkable(s - 1, l) {
            out.push((s - 1, l));
        }
        if self.walkable(s + 1, l) {
            out.push((s + 1, l));
        }
        if self.linked(s, l, l + 1) {
            out.push((s, l + 1));
        }
        if self.linked(s, l, l - 1) {
            out.push((s, l - 1));
        }
        out
    }

    pub fn compute_reach(&mut self) {
        let mut reach = [[false; LEVEL_SPAN]; SLOTS as usize];
        let mut queue = VecDeque::from([(0, 0)]);
        reach[0][level_index(0)] = true;
        while let Some((s, l)) = queue.pop_front() {
            for (ns, nl) in self.neighbours(s, l) {
                let seen = &mut reach[ns as usize][level_index(nl)];
                if !*seen {
                    *seen = true;
                    queue.push_back((ns, nl));
                }
            }
        }
        self.reach = reach;
    }

    pub fn reachable(&self, s: i32, l: i32) -> bool {
        (0..SLOTS).contains(&s)
            && (-DEPTH..=LEVELS).contains(&l)
            && self.reach[s as usize][level_index(l)]
    }

    pub fn reachable_nodes(&self) -> Vec<Node> {
        let mut out = Vec::new();
        for s in 0..SLOTS {
            for l in -DEPTH..=LEVELS {
                if self.occupied(s, l) && self.reachable(s, l) {
                    out.push((s, l));
                }
            }
        }
        out
    }

    pub fn find_path(&self, from: Node, to: Node) -> Option<VecDeque<Node>> {
        if from == to {
            return Some(VecDeque::new());
        }
        let mut prev = [[None::<Node>; LEVEL_SPAN]; SLOTS as usize];
        let mut seen = [[false; LEVEL_SPAN]; SLOTS as usize];
        seen[from.0 as usize][level_index(from.1)] = true;
        let mut queue = VecDeque::from([from]);
        while let Some((s, l)) = queue.pop_front() {
            if (s, l) == to {
                break;
            }
            for (ns, nl) in self.neighbours(s, l) {
                let (i, j) = (ns as usize, level_index(nl));
                if !seen[i][j] {
                    seen[i][j] = true;
                    prev[i][j] = Some((s, l));
                    queue.push_back((ns, nl));
                }
            }
        }
        if !seen[to.0 as usize][level_index(to.1)] {
            return None;
        }
        let mut path = VecDeque::new();
        let mut at = to;
        while at != from {
            path.push_front(at);
            at = prev[at.0 as usize][level_index(at.1)]?;
        }
        Some(path)
    }

    /// Reachable spots from which a tender can work on the cell at (s, l),
    /// each with the x position to stand at.
    pub fn access_nodes(&self, s: i32, l: i32) -> Vec<(Node, f64)> {
        let mut out = Vec::with_capacity(3);
        let cl = toward(l);
        if self.reachable(s, cl) && (cl == 0 || self.conn_at(s, cl)) {
            out.push(((s, cl), center(s)));
        }
        if self.walkable(s - 1, l) && self.reachable(s - 1, l) {
            out.push(((s - 1, l), s as f64 * SW - 6.0));
        }
        if self.walkable(s + 1, l) && self.reachable(s + 1, l) {
            out.push(((s + 1, l), (s + 1) as f64 * SW + 6.0));
        }
        out
    }

    pub fn project_at(&self, s: i32, l: i32) -> bool {
        self.projects.iter().any(|p| {
            if p.cells.is_empty() {
                p.s == s && p.l == l
            } else {
                p.cells.contains(&(s, l))
            }
        })
    }

    pub fn project_access(&self, p: &Project) -> Vec<(Node, f64)> {
        if p.kind == Kind::Cottage {
            let Some(host) = p.host else { return vec![] };
            return if self.reachable(p.s, p.l) {
                vec![((p.s, p.l), self.rooms[host].s as f64 * SW + p.cx as f64)]
            } else {
                vec![]
            };
        }
        if p.cells.is_empty() {
            return self.access_nodes(p.s, p.l);
        }
        let mut out: Vec<(Node, f64)> = Vec::new();
        for &(s, l) in &p.cells {
            for entry in self.access_nodes(s, l) {
                if !out.iter().any(|(node, _)| *node == entry.0) {
                    out.push(entry);
                }
            }
        }
        out
    }

    // ---------- the Wild ----------

    /// Wild floors from the lowest up.
    pub fn wild_floors(&self) -> Vec<RoomId> {
        let mut floors: Vec<RoomId> = (0..self.rooms.len())
            .filter(|&id| self.rooms[id].kind.is_wild())
            .collect();
        floors.sort_by_key(|&id| (self.rooms[id].l, self.rooms[id].s));
        floors
    }

    /// Wild floors joined to this one by a tube.
    pub fn wild_links(&self, id: RoomId) -> Vec<RoomId> {
        let mut out = Vec::new();
        for (s, l) in self.cells_of(id) {
            for (ns, nl) in [(s - 1, l), (s + 1, l), (s, l + 1), (s, l - 1)] {
                let Some(raw) = self.room_id_at(ns, nl) else {
                    continue;
                };
                let n = self.main_of(raw);
                if n != id && self.rooms[n].kind.is_wild() && !out.contains(&n) {
                    out.push(n);
                }
            }
        }
        out
    }

    pub fn species_alive(&self) -> usize {
        let floors = self.wild_floors();
        (0..SPECIES_COUNT)
            .filter(|&k| {
                floors
                    .iter()
                    .map(|&f| self.rooms[f].animals[k])
                    .sum::<f64>()
                    >= 1.0
            })
            .count()
    }

    pub fn pod_count(&self) -> i32 {
        self.rooms
            .iter()
            .map(|f| match f.kind {
                Kind::Grand => round((f.w * f.h) as f64 / 2.0) as i32,
                Kind::Atrium | Kind::Lagoon => 2,
                k if k.is_wild() => 1,
                _ => 0,
            })
            .sum()
    }

    /// Every wild column is closed at the top by glass.
    pub fn wild_sealed(&self) -> bool {
        if self.pod_count() < 6 || self.wild_slots.len() < 2 {
            return false;
        }
        self.wild_slots.iter().all(|&s| {
            matches!(
                self.kind_at(s, self.height_of(s)),
                Some(
                    Kind::Dome
                        | Kind::Atrium
                        | Kind::AtriumPart
                        | Kind::Marsh
                        | Kind::Lagoon
                        | Kind::LagoonPart
                        | Kind::Grand
                        | Kind::GrandPart
                )
            )
        })
    }

    pub fn grand_count(&self) -> i32 {
        self.count(Kind::Grand) as i32
    }
}
