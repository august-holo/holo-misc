//! What viewers are sent. Two messages, both complete snapshots, so a viewer
//! that misses any number of them is correct again after the next one:
//!
//! - `world`: the city and everything that changes slowly.
//! - `frame`: everything that moves, several times a second.

use serde::Serialize;

use super::defs::*;
use super::world::*;

/// Bumped whenever the shape of a message changes.
pub const PROTOCOL: u32 = 1;

fn r1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

fn r2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn r3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

fn zero(x: &f64) -> bool {
    *x == 0.0
}

fn zero_i(x: &i32) -> bool {
    *x == 0
}

fn no(x: &bool) -> bool {
    !*x
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorldMessage<'a> {
    r#type: &'static str,
    v: u32,
    run: u64,
    /// The day on which this world ends and a new one begins.
    last_day: i32,
    stock: [f64; 4],
    water_cap: f64,
    light_cap: f64,
    flow: [f64; 5],
    forest_health: f64,
    wild_slots: &'a [i32],
    wild_days: f64,
    wild_achieved: bool,
    marker: Option<i32>,
    street: Vec<i32>,
    trees: Vec<TreeMessage>,
    rooms: Vec<RoomMessage<'a>>,
    projects: Vec<ProjectMessage<'a>>,
    cottages: Vec<CottageMessage>,
    agents: Vec<AgentMessage<'a>>,
    almanac: Vec<(i32, &'a str)>,
    log: Vec<(u64, &'a str)>,
}

#[derive(Serialize)]
struct TreeMessage {
    x: f64,
    size: i32,
    amt: i32,
}

#[derive(Serialize)]
struct CedarMessage {
    x: f64,
    h: f64,
    seed: f64,
}

#[derive(Serialize)]
struct MuralMessage {
    seed: f64,
    theme: &'static str,
}

#[derive(Serialize)]
struct RoomMessage<'a> {
    kind: Kind,
    s: i32,
    #[serde(rename = "L")]
    l: i32,
    #[serde(skip_serializing_if = "zero_i")]
    amt: i32,
    water: f64,
    age: f64,
    #[serde(skip_serializing_if = "zero")]
    seed: f64,
    #[serde(skip_serializing_if = "zero_i")]
    vines: i32,
    #[serde(skip_serializing_if = "zero")]
    plants: f64,
    #[serde(skip_serializing_if = "zero")]
    fert: f64,
    /// Creature counts in `Species` order; only wild floors have them.
    #[serde(skip_serializing_if = "Option::is_none")]
    animals: Option<[f64; SPECIES_COUNT]>,
    #[serde(skip_serializing_if = "zero")]
    level: f64,
    #[serde(skip_serializing_if = "no")]
    channel: bool,
    #[serde(skip_serializing_if = "zero_i")]
    tier: i32,
    #[serde(skip_serializing_if = "zero_i")]
    w: i32,
    #[serde(skip_serializing_if = "zero_i")]
    h: i32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    cedars: Vec<CedarMessage>,
    #[serde(skip_serializing_if = "zero")]
    canopy: f64,
    #[serde(skip_serializing_if = "<[usize]>::is_empty")]
    cottages: &'a [usize],
    #[serde(skip_serializing_if = "Option::is_none")]
    mural: Option<MuralMessage>,
    #[serde(skip_serializing_if = "no")]
    glowvine: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    find: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pair: Option<RoomId>,
    /// For a secondary cell, the index of the room it belongs to.
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    main: Option<RoomId>,
}

#[derive(Serialize)]
struct ProjectMessage<'a> {
    id: u32,
    kind: Kind,
    s: i32,
    #[serde(rename = "L")]
    l: i32,
    work: f64,
    funded: bool,
    #[serde(skip_serializing_if = "<[Node]>::is_empty")]
    cells: &'a [Node],
    #[serde(skip_serializing_if = "Option::is_none")]
    host: Option<RoomId>,
    #[serde(skip_serializing_if = "zero_i")]
    cx: i32,
    #[serde(skip_serializing_if = "zero_i")]
    w: i32,
    #[serde(skip_serializing_if = "zero_i")]
    h: i32,
}

#[derive(Serialize)]
struct CottageMessage {
    host: RoomId,
    lvl: i32,
    #[serde(rename = "L")]
    l: i32,
    x: f64,
    seed: f64,
    age: f64,
}

/// The parts of a tender that change rarely, or that only the follow panel shows.
#[derive(Serialize)]
struct AgentMessage<'a> {
    name: &'a str,
    shirt: &'static str,
    hair: &'static str,
    hat: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    hobby: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scarf: Option<&'static str>,
    /// Level of their home, and whether it is a cottage.
    #[serde(skip_serializing_if = "Option::is_none")]
    home: Option<(i32, bool)>,
    thought: &'static str,
    energy: f64,
    joy: f64,
    /// Curiosity, chattiness, diligence and whimsy, each 0..100.
    traits: [f64; 4],
    /// Names of the tenders they have become inseparable from.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    close: Vec<&'a str>,
}

#[derive(Serialize)]
struct FrameMessage {
    r#type: &'static str,
    run: u64,
    /// Simulated seconds since the world began.
    t: f64,
    day: i32,
    tod: f64,
    rain: bool,
    wind: f64,
    flash: f64,
    storm: f64,
    blackout: f64,
    supper: f64,
    festival: f64,
    bell: f64,
    kite: bool,
    spill: f64,
    agents: Vec<AgentFrame>,
    /// Progress of each project, as (id, work done).
    progress: Vec<(u32, f64)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ship: Option<(f64, f64, i32)>,
    cat: (f64, f64, f64, CatState),
    fox: (f64, f64),
    #[serde(skip_serializing_if = "Option::is_none")]
    birds: Option<(f64, f64, f64)>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    /// x, y, velocity and seconds left, so the page can carry them on between frames.
    shooters: Vec<(f64, f64, f64, f64, f64)>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    fx: Vec<EffectMessage>,
}

/// x, y, slot, level, state, facing, climbing, carrying, flags, bowl,
/// project being built, slot of the next step while riding a gondola.
type AgentFrame = (
    f64,
    f64,
    i32,
    i32,
    State,
    i32,
    u8,
    u8,
    u8,
    i32,
    Option<u32>,
    Option<i32>,
);

const LEADING: u8 = 1;
const STARTLED: u8 = 2;
const MUSICIAN: u8 = 4;

#[derive(Serialize)]
#[serde(tag = "fx", rename_all = "lowercase")]
enum EffectMessage {
    Built { x: f64, y: f64 },
    Cottage { x: f64, y: f64 },
    Wild,
    Celebrate,
}

fn hobby_name(h: Hobby) -> &'static str {
    match h {
        Hobby::Musician => "musician",
        Hobby::Painter => "painter",
        Hobby::Stargazer => "stargazer",
        Hobby::Tinker => "tinker",
        Hobby::Birder => "birder",
    }
}

fn find_name(f: Find) -> &'static str {
    match f {
        Find::Geode => "geode",
        Find::Spring => "spring",
        Find::Relic => "relic",
        Find::Fossil => "fossil",
    }
}

impl World {
    pub fn world_message(&self, run: u64, last_day: i32) -> String {
        let rooms = self
            .rooms
            .iter()
            .map(|b| RoomMessage {
                kind: b.kind,
                s: b.s,
                l: b.l,
                amt: b.amt,
                water: r2(b.water),
                age: b.age.floor(),
                seed: r3(b.seed),
                vines: b.vines,
                plants: r1(b.plants),
                fert: if b.kind.is_wild() { r2(b.fert) } else { 0.0 },
                animals: b.kind.is_wild().then(|| b.animals.map(r1)),
                level: r2(b.level),
                channel: b.channel,
                tier: b.tier,
                w: b.w,
                h: b.h,
                cedars: b
                    .cedars
                    .iter()
                    .map(|c| CedarMessage {
                        x: r1(c.x),
                        h: r3(c.h),
                        seed: r3(c.seed),
                    })
                    .collect(),
                canopy: r3(b.canopy),
                cottages: &b.cottages,
                mural: b.mural.as_ref().map(|m| MuralMessage {
                    seed: r3(m.seed),
                    theme: m.theme,
                }),
                glowvine: b.glowvine,
                find: b.find.map(find_name),
                pair: b.pair,
                main: b.main,
            })
            .collect();

        let agents = self
            .agents
            .iter()
            .map(|a| AgentMessage {
                name: &a.name,
                shirt: a.shirt,
                hair: a.hair,
                hat: a.hat,
                hobby: a.hobby.map(hobby_name),
                scarf: a.scarf,
                home: a
                    .home
                    .map(|h| (self.home_node(h).1, matches!(h, Home::Cottage(_)))),
                thought: a.thought,
                energy: a.energy.round(),
                joy: a.joy.round(),
                traits: [a.cur, a.soc, a.dil, a.whim].map(|t| (t * 100.0).round()),
                close: a
                    .bond
                    .iter()
                    .enumerate()
                    .filter(|(_, n)| **n >= 6)
                    .map(|(other, _)| self.agents[other].name.as_str())
                    .collect(),
            })
            .collect();

        let message = WorldMessage {
            r#type: "world",
            v: PROTOCOL,
            run,
            last_day,
            stock: [
                self.stock.light,
                self.stock.leaf,
                self.stock.metal,
                self.stock.water,
            ]
            .map(r1),
            water_cap: self.water_cap,
            light_cap: self.light_cap,
            flow: [
                self.flow.inflow,
                self.flow.gardens,
                self.flow.forest,
                self.flow.turbine,
                self.flow.wild,
            ]
            .map(r3),
            forest_health: r2(self.forest_health),
            wild_slots: &self.wild_slots,
            wild_days: r2(self.wild_days),
            wild_achieved: self.wild_achieved,
            marker: self.marker,
            street: self.street.iter().map(|s| s.amt).collect(),
            trees: self
                .trees
                .iter()
                .map(|t| TreeMessage {
                    x: t.x,
                    size: t.size,
                    amt: t.amt,
                })
                .collect(),
            rooms,
            projects: self
                .projects
                .iter()
                .map(|p| ProjectMessage {
                    id: p.id,
                    kind: p.kind,
                    s: p.s,
                    l: p.l,
                    work: p.work,
                    funded: p.funded,
                    cells: &p.cells,
                    host: p.host,
                    cx: p.cx,
                    w: p.w,
                    h: p.h,
                })
                .collect(),
            cottages: self
                .cottages
                .iter()
                .map(|c| CottageMessage {
                    host: c.host,
                    lvl: c.lvl,
                    l: c.l,
                    x: c.x,
                    seed: r3(c.seed),
                    age: c.age.floor(),
                })
                .collect(),
            agents,
            almanac: self.almanac.iter().map(|(d, t)| (*d, t.as_str())).collect(),
            log: self.log.iter().map(|(n, t)| (*n, t.as_str())).collect(),
        };
        serde_json::to_string(&message).expect("world message serializes")
    }

    /// Takes the effects that happened since the last frame along with it.
    pub fn frame_message(&mut self, run: u64) -> String {
        let agents = self
            .agents
            .iter()
            .map(|a| {
                let mut flags = 0;
                if a.leading {
                    flags |= LEADING;
                }
                if a.startled > 0.0 {
                    flags |= STARTLED;
                }
                if a.hobby == Some(Hobby::Musician) {
                    flags |= MUSICIAN;
                }
                let carry = match a.carry {
                    None => 0,
                    Some(Resource::Leaf) => 1,
                    Some(Resource::Metal) => 2,
                };
                let building = (a.state == State::Build).then_some(a.proj).flatten();
                let riding_to = (a.climbing == Climb::Gondola)
                    .then(|| a.path.front().map(|n| n.0))
                    .flatten();
                (
                    r1(a.px),
                    r1(a.py),
                    a.s,
                    a.l,
                    a.state,
                    a.face as i32,
                    a.climbing as u8,
                    carry,
                    flags,
                    a.bowl,
                    building,
                    riding_to,
                )
            })
            .collect();

        let fx = self
            .effects
            .drain(..)
            .map(|e| match e {
                Effect::Built { x, y } => EffectMessage::Built { x, y },
                Effect::CottageBuilt { x, y } => EffectMessage::Cottage { x, y },
                Effect::WildHolds => EffectMessage::Wild,
                Effect::Celebrate => EffectMessage::Celebrate,
            })
            .collect();

        let message = FrameMessage {
            r#type: "frame",
            run,
            t: r2(self.sim_time),
            day: self.day,
            tod: (self.tod * 1e5).round() / 1e5,
            rain: self.rain_now,
            wind: r1(self.wind),
            flash: r2(self.flash),
            storm: r1(self.storm.max(0.0)),
            blackout: r1(self.blackout.max(0.0)),
            supper: r1(self.supper.max(0.0)),
            festival: r1(self.festival.max(0.0)),
            bell: r1(self.bell.max(0.0)),
            kite: self.kite_day,
            spill: r2(self.spill),
            agents,
            progress: self
                .projects
                .iter()
                .map(|p| (p.id, r1(p.progress)))
                .collect(),
            ship: self
                .ship
                .active
                .then(|| (r1(self.ship.x), r1(self.ship.y), self.ship.phase)),
            cat: (r1(self.cat.x), self.cat.y, self.cat.dir, self.cat.state),
            fox: (r1(self.fox.x), self.fox.dir),
            birds: self.birds.as_ref().map(|b| (r1(b.x), r1(b.y), r2(b.t))),
            shooters: self
                .shooters
                .iter()
                .map(|s| (r1(s.x), r1(s.y), r1(s.vx), r1(s.vy), r2(s.life)))
                .collect(),
            fx,
        };
        serde_json::to_string(&message).expect("frame message serializes")
    }
}
