use std::collections::VecDeque;

use super::defs::*;
use super::world::*;

const HERD: [&str; 3] = [
    "Come on, goat. Better grass this way.",
    "Goats do not care about the balance. That's my job.",
    "Tunnels are for goats too, apparently.",
];
const WILD: [&str; 5] = [
    "Counted the frogs today. Three. Good.",
    "Kelp for the kitchen, minnows for the pot. Two, no more.",
    "The marsh is full again. Listen to the channel run.",
    "The Wild smells like rain inside rain.",
    "Take a little, leave a lot.",
];
const IDLE: [&str; 2] = ["Hmm. What now?", "Listening to the turbines turn."];

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Errand {
    Build,
    GatherLeaf,
    GatherMetal,
    Tend,
    Herd,
    HarvestWild,
    Plant,
    Grove,
    Paint,
    Stargaze,
    Birdwatch,
    Social,
    Explore,
    Sunbathe,
    Rest,
    Bath,
    Market,
    Dance,
    Dine,
    Startled,
}

fn thoughts(errand: Errand) -> &'static [&'static str] {
    match errand {
        Errand::GatherLeaf => &[
            "Greens from the racks, greens from the grove.",
            "Just a little from the Wild. Leave the rest for the frogs.",
            "The grove keeps giving. I should say thanks.",
            "One more armful, then a nap.",
        ],
        Errand::GatherMetal => &[
            "Ore glitters if you hold the lamp right.",
            "Deep breath. Long ladder.",
            "Old-world bones make new-world beams.",
        ],
        Errand::Build => &[
            "Bolt, beam, breathe. Bolt, beam, breathe.",
            "This floor will catch the morning light.",
            "If it wobbles, add a vine.",
            "Higher. Always a little higher.",
        ],
        Errand::Tend => &[
            "Drip line's clogged again.",
            "Drink up, little greens.",
            "Wet soil smells like a promise.",
        ],
        Errand::Plant => &[
            "A tree for someone I haven't met yet.",
            "The grove wants company.",
            "Seed, meet soil.",
        ],
        Errand::Grove => &[
            "Just going to stand under the leaves a while.",
            "The grove is louder than the market, if you listen.",
        ],
        Errand::Social => &[
            "Did you see the lift go all the way up?",
            "I heard the hub hums at night.",
            "Tell me about your floor.",
        ],
        Errand::Explore => &[
            "What does the city look like from up there?",
            "Riding the lift just to see.",
            "How deep does the shaft go?",
        ],
        Errand::Rest => &[
            "Zzz... solar-powered.",
            "Charging like a loft.",
            "Five more minutes.",
        ],
        Errand::Sunbathe => &[
            "Warm rail. Best rail.",
            "Photosynthesizing, probably.",
            "The whole city below me.",
        ],
        Errand::Bath => &["Steam and stars.", "Soak first, think later."],
        Errand::Market => &[
            "Lantern light and roasted seeds.",
            "Everyone ends up at the market.",
        ],
        Errand::Dance => &[
            "The bell! Everybody down to the hub!",
            "Dance until the lanterns dim.",
        ],
        Errand::Dine => &[
            "Soup. Finally.",
            "Who made the kelp fritters? They're good.",
            "Long day. Good bread. Better company.",
            "Pass the rain tea.",
        ],
        Errand::Startled => &["WHOA. Wind.", "Who turned on the sky?", "My hat!"],
        Errand::Herd => &HERD,
        Errand::HarvestWild => &WILD,
        _ => &IDLE,
    }
}

/// Where to stand after walking the path.
#[derive(Clone, Copy)]
pub enum Spot {
    /// Somewhere around the middle of the destination.
    Scatter,
    At(f64),
    /// Wherever the path ends.
    PathEnd,
}

impl World {
    pub fn spawn_agent(&mut self, edge: bool) -> AgentId {
        let free: Vec<&str> = NAMES
            .iter()
            .copied()
            .filter(|n| !self.agents.iter().any(|a| a.name == *n))
            .collect();
        let name = if free.is_empty() {
            format!("{} II", self.rng.pick(&NAMES))
        } else {
            self.rng.pick(&free).to_string()
        };
        let energy = self.rng.range(60.0, 100.0);
        let joy = self.rng.range(50.0, 80.0);
        let cur = self.rng.range(0.2, 1.0);
        let soc = self.rng.range(0.2, 1.0);
        let dil = self.rng.range(0.3, 1.0);
        let whim = self.rng.range(0.1, 0.9);
        let shirt = self.rng.pick(&SHIRTS);
        let hair = self.rng.pick(&HAIR);
        let hat = self.rng.int(0, 2);
        let hobby = self.rng.chance(0.55).then(|| {
            self.rng.pick(&[
                Hobby::Musician,
                Hobby::Painter,
                Hobby::Stargazer,
                Hobby::Tinker,
                Hobby::Birder,
            ])
        });
        let paint_t = self.rng.range(200.0, 500.0);
        let (s, px) = if edge {
            if self.rng.chance(0.5) {
                (0, 2.0)
            } else {
                (SLOTS - 1, WW - 3.0)
            }
        } else {
            let s = self.rng.int(5, 8);
            (s, center(s) + self.rng.range(-12.0, 12.0))
        };

        self.agents.push(Agent {
            name,
            s,
            l: 0,
            px,
            py: feet_y(0),
            path: VecDeque::new(),
            state: State::Idle,
            next: State::Idle,
            arrive: false,
            timer: 0.0,
            carry: None,
            carry_n: 0.0,
            energy,
            joy,
            cur,
            soc,
            dil,
            whim,
            shirt,
            hair,
            hat,
            hobby,
            scarf: None,
            bond: Vec::new(),
            paint_t,
            home: None,
            thought: "",
            face: 1.0,
            startled: 0.0,
            dance: 0.0,
            climbing: Climb::None,
            leading: false,
            bowl: 0,
            tx: None,
            proj: None,
            work_t: 0.0,
            rest_t: 0.0,
            res: Resource::Leaf,
            src: None,
            garden: None,
            herd_from: None,
            herd_to: None,
            buddy: None,
        });
        self.agents.len() - 1
    }

    pub fn think(&mut self, id: AgentId, errand: Errand) {
        let lines = if errand == Errand::GatherLeaf
            && !self.wild_slots.is_empty()
            && self.rng.chance(0.4)
        {
            &WILD
        } else {
            thoughts(errand)
        };
        self.agents[id].thought = self.rng.pick(lines);
    }

    /// Sends a tender walking. Returns false, leaving them idle, if there is no way there.
    fn go_to(&mut self, id: AgentId, to: Node, next: State, spot: Spot) -> bool {
        let from = (self.agents[id].s, self.agents[id].l);
        let Some(path) = self.find_path(from, to) else {
            let a = &mut self.agents[id];
            a.state = State::Idle;
            a.timer = 1.0;
            return false;
        };
        let scatter = center(to.0) + self.rng.range(-12.0, 12.0);
        let a = &mut self.agents[id];
        a.path = path;
        a.state = State::Walk;
        a.next = next;
        a.tx = match spot {
            Spot::Scatter => Some(scatter),
            Spot::At(x) => Some(x),
            Spot::PathEnd => None,
        };
        true
    }

    fn go_home(&mut self, id: AgentId, home: Home, rest_t: f64) -> bool {
        let spot = match home {
            Home::Cottage(i) => Spot::At(self.cottages[i].x - 6.0),
            Home::Room(_) => Spot::PathEnd,
        };
        let sent = self.go_to(id, self.home_node(home), State::Rest, spot);
        if sent {
            self.agents[id].rest_t = rest_t;
        }
        sent
    }

    fn home_reachable(&self, id: AgentId) -> Option<Home> {
        let home = self.agents[id].home?;
        let (s, l) = self.home_node(home);
        self.reachable(s, l).then_some(home)
    }

    fn room_node(&self, id: RoomId) -> Node {
        (self.rooms[id].s, self.rooms[id].l)
    }

    fn pick_node(&mut self, rooms: &[RoomId]) -> Node {
        let room = self.rng.pick(rooms);
        self.room_node(room)
    }

    /// Materials that unfunded projects are still short of.
    fn project_needs(&self) -> (f64, f64) {
        let (mut leaf, mut metal) = (0.0, 0.0);
        for p in self.projects.iter().filter(|p| !p.funded) {
            leaf += (p.cost.leaf - self.stock.leaf).max(0.0);
            metal += (p.cost.metal - self.stock.metal).max(0.0);
        }
        (leaf, metal)
    }

    /// A bare floor with goats on it and an overgrown one to lead a goat to.
    fn find_herd_job(&self) -> Option<(RoomId, RoomId)> {
        use Species::Goat;
        let floors: Vec<RoomId> = self
            .wild_floors()
            .into_iter()
            .filter(|&f| self.reachable(self.rooms[f].s, self.rooms[f].l))
            .collect();
        let from = floors
            .iter()
            .copied()
            .filter(|&f| self.rooms[f].n(Goat) >= 1.0 && self.rooms[f].plants < 45.0)
            .min_by(|&a, &b| self.rooms[a].plants.total_cmp(&self.rooms[b].plants))?;
        let to = floors
            .iter()
            .copied()
            .filter(|&f| f != from && self.rooms[f].plants > 65.0 && self.rooms[f].n(Goat) < 3.0)
            .max_by(|&a, &b| self.rooms[a].plants.total_cmp(&self.rooms[b].plants))?;
        Some((from, to))
    }

    fn harvestable_wild(&self, id: RoomId) -> bool {
        let f = &self.rooms[id];
        self.reachable(f.s, f.l)
            && (f.plants > 50.0 - self.p.harvest * 0.25
                || (f.kind == Kind::Lagoon && f.n(Species::Minnow) > 5.0))
    }

    fn nearest(
        &self,
        id: AgentId,
        sources: &[(Node, Source, Spot)],
    ) -> Option<(Node, Source, Spot)> {
        let a = &self.agents[id];
        sources
            .iter()
            .copied()
            .min_by_key(|((s, l), _, _)| (s - a.s).abs() * 2 + (l - a.l).abs() * 3)
    }

    fn decide(&mut self, id: AgentId) {
        let daylight = self.daylight();

        if self.bell > 0.0 {
            let s = self.rng.int(5, 8);
            self.go_to(id, (s, 0), State::Dance, Spot::Scatter);
            self.think(id, Errand::Dance);
            return;
        }

        if self.festival > 0.0 && self.agents[id].state != State::Festival {
            let mut high: Vec<Node> = self
                .reachable_nodes()
                .into_iter()
                .filter(|n| n.1 > 0)
                .collect();
            let bridges = self.kinds_at(Kind::Bridge);
            let to = if !bridges.is_empty() && self.rng.chance(0.5) {
                self.pick_node(&bridges)
            } else if !high.is_empty() {
                high.sort_by_key(|n| std::cmp::Reverse(n.1));
                high[self.rng.index(high.len().min(6))]
            } else {
                (self.rng.pick(&HUB), 0)
            };
            self.go_to(id, to, State::Festival, Spot::Scatter);
            self.agents[id].thought = "Let it go. Watch it climb.";
            return;
        }

        if self.supper > 0.0 && self.agents[id].state != State::Dine {
            let hall = self
                .find_kind(Kind::Hall)
                .map(|h| self.room_node(h))
                .filter(|&(s, l)| self.reachable(s, l));
            if let Some((s, l)) = hall {
                let seat = s + if self.rng.chance(0.5) { 0 } else { 1 };
                let x = s as f64 * SW + 8.0 + self.rng.range(0.0, 64.0);
                self.go_to(id, (seat, l), State::Dine, Spot::At(x));
            } else {
                let markets = self.kinds_at(Kind::Market);
                if !markets.is_empty() && self.rng.chance(0.6) {
                    let (s, l) = self.pick_node(&markets);
                    let x = s as f64 * SW + 6.0 + self.rng.range(0.0, 28.0);
                    self.go_to(id, (s, l), State::Dine, Spot::At(x));
                } else {
                    let s = self.rng.pick(&HUB);
                    let x = HX + self.rng.range(0.0, 80.0);
                    self.go_to(id, (s, 0), State::Dine, Spot::At(x));
                }
            }
            self.think(id, Errand::Dine);
            return;
        }

        if self.agents[id].energy < 25.0 {
            if let Some(home) = self.home_reachable(id) {
                self.go_home(id, home, 14.0);
            } else {
                let a = &mut self.agents[id];
                a.state = State::Rest;
                a.timer = 10.0;
            }
            self.think(id, Errand::Rest);
            return;
        }

        let (need_leaf, need_metal) = self.project_needs();
        let funded: Vec<usize> = (0..self.projects.len())
            .filter(|&i| {
                self.projects[i].funded && !self.project_access(&self.projects[i]).is_empty()
            })
            .collect();
        let sunny = daylight > 0.5;
        let dry: Vec<RoomId> = self
            .kinds_at(Kind::Garden)
            .into_iter()
            .filter(|&g| self.rooms[g].water < 0.35)
            .collect();
        let herd_job = self.find_herd_job();
        let wild = self.wild_floors();
        let (dil, whim, soc, cur, joy, hobby, home) = {
            let a = &self.agents[id];
            (a.dil, a.whim, a.soc, a.cur, a.joy, a.hobby, a.home)
        };
        let p = &self.p;

        let mut options: Vec<(Errand, f64)> = Vec::with_capacity(20);
        if !funded.is_empty() {
            options.push((Errand::Build, dil * 1.7));
        }
        options.push((
            Errand::GatherLeaf,
            dil * if need_leaf > 0.0 { 1.4 } else { 0.35 }
                + if self.stock.leaf < 6.0 { 0.4 } else { 0.0 },
        ));
        options.push((
            Errand::GatherMetal,
            dil * if need_metal > 0.0 { 1.5 } else { 0.3 }
                + if self.stock.metal < 6.0 { 0.5 } else { 0.0 },
        ));
        if !dry.is_empty() && self.stock.water >= 1.0 {
            options.push((Errand::Tend, dil * 1.1));
        }
        if herd_job.is_some() {
            options.push((Errand::Herd, (p.herding / 50.0) * 1.3));
        }
        if wild.iter().any(|&f| self.harvestable_wild(f)) {
            options.push((
                Errand::HarvestWild,
                (p.harvest / 100.0) * (p.harvest / 100.0) * 1.6,
            ));
        }
        options.push((
            Errand::Plant,
            whim * if self.trees.len() < 10 { 0.8 } else { 0.05 },
        ));
        options.push((Errand::Grove, whim * 0.35));
        if hobby == Some(Hobby::Painter)
            && self.agents[id].paint_t <= 0.0
            && let Some(Home::Room(h)) = home
            && self.rooms[h].mural.is_none()
        {
            options.push((Errand::Paint, 1.2));
        }
        if hobby == Some(Hobby::Stargazer) && !sunny && !self.rain_now {
            options.push((Errand::Stargaze, 1.0));
        }
        if hobby == Some(Hobby::Birder) && !wild.is_empty() {
            options.push((Errand::Birdwatch, 0.6));
        }
        if hobby == Some(Hobby::Tinker) && self.projects.iter().any(|p| p.funded) {
            options.push((Errand::Build, 0.8));
        }
        options.push((
            Errand::Social,
            soc * (p.soc / 50.0) * if self.agents.len() > 1 { 0.9 } else { 0.0 },
        ));
        options.push((Errand::Explore, cur * (p.cur / 50.0) * 0.8));
        if sunny && joy < 60.0 {
            options.push((Errand::Sunbathe, 0.5));
        }
        if !sunny && home.is_some() {
            options.push((Errand::Rest, 0.6));
        }
        if !self.kinds_at(Kind::Bath).is_empty() && joy < 50.0 {
            options.push((Errand::Bath, 0.8));
        }
        if !self.kinds_at(Kind::Market).is_empty() && !sunny {
            options.push((Errand::Market, 0.7));
        }

        let choice = self.rng.weighted(&options);
        self.think(id, choice);
        self.start(id, choice, &funded, &dry, herd_job);
    }

    fn start(
        &mut self,
        id: AgentId,
        choice: Errand,
        funded: &[usize],
        dry: &[RoomId],
        herd_job: Option<(RoomId, RoomId)>,
    ) {
        match choice {
            Errand::Build => {
                // The tinker's option can be drawn when no funded project is within reach.
                if funded.is_empty() {
                    self.idle(id, 2.0);
                    return;
                }
                let project = self.rng.pick(funded);
                let access = self.project_access(&self.projects[project]);
                let (node, x) = self.rng.pick(&access);
                let project_id = self.projects[project].id;
                let work_t = self.rng.range(4.0, 8.0);
                if self.go_to(id, node, State::Build, Spot::At(x)) {
                    let a = &mut self.agents[id];
                    a.proj = Some(project_id);
                    a.work_t = work_t;
                }
            }
            Errand::GatherLeaf => {
                let mut sources: Vec<(Node, Source, Spot)> = Vec::new();
                for (i, t) in self.trees.iter().enumerate() {
                    if t.amt > 0 {
                        sources.push(((t.s, 0), Source::Tree(i), Spot::At(t.x)));
                    }
                }
                for (i, b) in self.rooms.iter().enumerate() {
                    if matches!(b.kind, Kind::Garden | Kind::Cave | Kind::Dome)
                        && b.amt > 0
                        && self.reachable(b.s, b.l)
                    {
                        sources.push(((b.s, b.l), Source::Room(i), Spot::PathEnd));
                    }
                }
                for f in self.wild_floors() {
                    let b = &self.rooms[f];
                    if b.plants > 50.0 - self.p.harvest * 0.25
                        && self.reachable(b.s, b.l)
                        && self.rng.chance(self.p.harvest / 100.0)
                    {
                        sources.push((self.room_node(f), Source::Room(f), Spot::PathEnd));
                    }
                }
                self.gather(id, &sources, Resource::Leaf);
            }
            Errand::GatherMetal => {
                let mut sources: Vec<(Node, Source, Spot)> = Vec::new();
                for (s, st) in self.street.iter().enumerate() {
                    if st.sub == StreetKind::Rubble && st.amt > 0 {
                        sources.push(((s as i32, 0), Source::Rubble(s as i32), Spot::Scatter));
                    }
                }
                for g in self.kinds_at(Kind::Gallery) {
                    if self.rooms[g].amt > 0 {
                        sources.push((self.room_node(g), Source::Room(g), Spot::Scatter));
                    }
                }
                self.gather(id, &sources, Resource::Metal);
            }
            Errand::Tend => {
                let garden = self.rng.pick(dry);
                if self.go_to(id, self.room_node(garden), State::Tendg, Spot::Scatter) {
                    self.agents[id].garden = Some(garden);
                }
            }
            Errand::HarvestWild => {
                let best = self
                    .wild_floors()
                    .into_iter()
                    .filter(|&f| self.harvestable_wild(f))
                    .max_by(|&a, &b| self.rooms[a].plants.total_cmp(&self.rooms[b].plants));
                if let Some(f) = best
                    && self.go_to(id, self.room_node(f), State::Harvest, Spot::Scatter)
                {
                    let a = &mut self.agents[id];
                    a.res = Resource::Leaf;
                    a.src = Some(Source::Room(f));
                }
            }
            Errand::Herd => {
                if let Some((from, to)) = herd_job
                    && self.go_to(id, self.room_node(from), State::Herd1, Spot::Scatter)
                {
                    let a = &mut self.agents[id];
                    a.herd_from = Some(from);
                    a.herd_to = Some(to);
                }
            }
            Errand::Plant | Errand::Grove => {
                let s = self.rng.pick(&GROVE);
                let x = self.rng.range(6.0, 74.0);
                let next = if choice == Errand::Plant {
                    State::Plant
                } else {
                    State::Look
                };
                self.go_to(id, (s, 0), next, Spot::At(x));
            }
            Errand::Paint => {
                if let Some(home) = self.agents[id].home {
                    self.go_to(id, self.home_node(home), State::Paint, Spot::Scatter);
                }
            }
            Errand::Stargaze => {
                let under_observatory = self
                    .rooms
                    .iter()
                    .find(|m| m.kind == Kind::Observatory && self.reachable(m.s, m.l - 1))
                    .map(|m| (m.s, m.l - 1));
                let highest = || {
                    self.reachable_nodes()
                        .into_iter()
                        .filter(|n| n.1 > 0)
                        .max_by_key(|n| n.1)
                };
                match under_observatory.or_else(highest) {
                    Some(node) => {
                        self.go_to(id, node, State::Stargaze, Spot::Scatter);
                    }
                    None => self.agents[id].state = State::Idle,
                }
            }
            Errand::Birdwatch => {
                let floors: Vec<RoomId> = self
                    .wild_floors()
                    .into_iter()
                    .filter(|&f| self.reachable(self.rooms[f].s, self.rooms[f].l))
                    .collect();
                if floors.is_empty() {
                    self.agents[id].state = State::Idle;
                } else {
                    let f = self.rng.pick(&floors);
                    self.go_to(id, self.room_node(f), State::Look, Spot::Scatter);
                }
            }
            Errand::Social => {
                let others: Vec<AgentId> = (0..self.agents.len())
                    .filter(|&o| o != id && self.reachable(self.agents[o].s, self.agents[o].l))
                    .collect();
                if !others.is_empty() {
                    let buddy = self.rng.pick(&others);
                    let node = (self.agents[buddy].s, self.agents[buddy].l);
                    if self.go_to(id, node, State::Chat, Spot::Scatter) {
                        self.agents[id].buddy = Some(buddy);
                    }
                }
            }
            Errand::Explore => {
                let nodes = self.reachable_nodes();
                let here = self.agents[id].l.abs();
                let far: Vec<Node> = nodes.iter().copied().filter(|n| n.1.abs() > here).collect();
                let pool = if !far.is_empty() && self.rng.chance(self.p.climb / 100.0) {
                    &far
                } else {
                    &nodes
                };
                let node = self.rng.pick(pool);
                self.go_to(id, node, State::Look, Spot::Scatter);
            }
            Errand::Sunbathe => {
                let bridges = self.kinds_at(Kind::Bridge);
                let node = if bridges.is_empty() {
                    (self.rng.int(2, 7), 0)
                } else {
                    self.pick_node(&bridges)
                };
                self.go_to(id, node, State::Sunbathe, Spot::Scatter);
            }
            Errand::Rest => {
                if let Some(home) = self.agents[id].home {
                    self.go_home(id, home, 12.0);
                }
            }
            Errand::Bath => {
                let baths = self.kinds_at(Kind::Bath);
                let node = self.pick_node(&baths);
                self.go_to(id, node, State::Soak, Spot::Scatter);
            }
            Errand::Market => {
                let markets = self.kinds_at(Kind::Market);
                let node = self.pick_node(&markets);
                self.go_to(id, node, State::Browse, Spot::Scatter);
            }
            _ => {
                let t = self.rng.range(1.0, 3.0);
                self.idle(id, t);
            }
        }
    }

    fn idle(&mut self, id: AgentId, timer: f64) {
        let a = &mut self.agents[id];
        a.state = State::Idle;
        a.timer = timer;
    }

    fn gather(&mut self, id: AgentId, sources: &[(Node, Source, Spot)], res: Resource) {
        let Some((node, src, spot)) = self.nearest(id, sources) else {
            self.idle(id, 2.0);
            return;
        };
        if self.go_to(id, node, State::Harvest, spot) {
            let a = &mut self.agents[id];
            a.res = res;
            a.src = Some(src);
        }
    }

    pub fn update_agent(&mut self, id: AgentId, dt: f64) {
        {
            let a = &mut self.agents[id];
            a.energy -= dt * 0.5;
            a.joy -= dt * 0.18;
            if a.startled > 0.0 {
                a.startled -= dt;
                return;
            }
        }
        if self.agents[id].state == State::Walk {
            self.walk(id, dt);
            return;
        }

        {
            let a = &mut self.agents[id];
            a.timer -= dt;
            a.paint_t -= dt;
        }
        let arrived = std::mem::take(&mut self.agents[id].arrive);
        let timer_done = |w: &World| w.agents[id].timer <= 0.0;

        match self.agents[id].state {
            State::Idle => {
                if timer_done(self) {
                    self.decide(id);
                }
            }
            State::Harvest => {
                if arrived {
                    let a = &mut self.agents[id];
                    a.timer = if a.res == Resource::Metal { 3.0 } else { 2.2 };
                }
                if timer_done(self) {
                    self.harvest(id);
                }
            }
            State::Deposit => {
                let a = &mut self.agents[id];
                match a.carry.take() {
                    Some(Resource::Leaf) => self.stock.leaf += a.carry_n,
                    Some(Resource::Metal) => self.stock.metal += a.carry_n,
                    None => {}
                }
                a.state = State::Idle;
                a.timer = 0.6;
                a.joy += 2.0;
            }
            State::Build => self.build(id, arrived, dt),
            State::Herd1 => {
                if arrived {
                    self.agents[id].timer = 1.5;
                }
                if timer_done(self) {
                    let (from, to) = (self.agents[id].herd_from, self.agents[id].herd_to);
                    match (from, to) {
                        (Some(from), Some(to)) if self.rooms[from].n(Species::Goat) >= 1.0 => {
                            *self.rooms[from].n_mut(Species::Goat) -= 1.0;
                            self.agents[id].leading = true;
                            self.go_to(id, self.room_node(to), State::Herd2, Spot::Scatter);
                        }
                        _ => self.agents[id].state = State::Idle,
                    }
                }
            }
            State::Herd2 => {
                if arrived {
                    self.agents[id].timer = 1.0;
                }
                if timer_done(self) {
                    let a = &mut self.agents[id];
                    a.leading = false;
                    a.joy += 4.0;
                    a.state = State::Idle;
                    if let Some(to) = a.herd_to {
                        *self.rooms[to].n_mut(Species::Goat) += 1.0;
                        if self.rng.chance(0.5) {
                            let line = format!(
                                "{} led a moss-goat to greener pasture on {}.",
                                self.agents[id].name,
                                lv_name(self.rooms[to].l)
                            );
                            self.log(line);
                        }
                    }
                }
            }
            State::Tendg => {
                if arrived {
                    self.agents[id].timer = 2.0;
                }
                if timer_done(self) {
                    if let Some(g) = self.agents[id].garden
                        && self.stock.water >= 1.0
                    {
                        self.stock.water -= 1.0;
                        self.rooms[g].water = (self.rooms[g].water + 0.5).min(1.0);
                    }
                    let a = &mut self.agents[id];
                    a.state = State::Idle;
                    a.joy += 2.0;
                }
            }
            State::Plant => {
                if arrived {
                    self.agents[id].timer = 1.8;
                }
                if timer_done(self) {
                    let (px, face) = (self.agents[id].px, self.agents[id].face);
                    if self.trees.len() < 10 && !self.trees.iter().any(|t| (t.x - px).abs() < 12.0)
                    {
                        self.trees.push(Tree {
                            x: round(px) + if face > 0.0 { 6.0 } else { -6.0 },
                            s: slot_of(px),
                            amt: 0,
                            grow: 0.0,
                            size: 0,
                        });
                        self.changed = true;
                        let line =
                            format!("{} planted a sapling in the grove.", self.agents[id].name);
                        self.log(line);
                        self.agents[id].joy += 5.0;
                    }
                    self.agents[id].state = State::Idle;
                }
            }
            State::Chat => {
                if arrived {
                    self.chat(id);
                }
                if timer_done(self) {
                    self.agents[id].state = State::Idle;
                }
            }
            State::Look => {
                if arrived {
                    let timer = self.rng.range(2.0, 5.0);
                    let (l, s) = (self.agents[id].l, self.agents[id].s);
                    let grove = if s < 2 { self.forest_health * 4.0 } else { 0.0 };
                    let a = &mut self.agents[id];
                    a.timer = timer;
                    a.joy += 3.0 + l.abs() as f64 * 0.6 + grove;
                    if l >= 6 && self.rng.chance(0.4) {
                        let line = format!(
                            "{} is admiring the view from floor {l}.",
                            self.agents[id].name
                        );
                        self.log(line);
                    }
                    if l <= -3 && self.rng.chance(0.4) {
                        let line = format!(
                            "{} is listening to the deep at depth {}.",
                            self.agents[id].name, -l
                        );
                        self.log(line);
                    }
                }
                if timer_done(self) {
                    self.agents[id].state = State::Idle;
                }
            }
            State::Sunbathe => {
                if arrived {
                    self.agents[id].timer = self.rng.range(5.0, 9.0);
                }
                let a = &mut self.agents[id];
                a.joy += dt * 2.0;
                a.energy += dt * 1.2;
                if a.timer <= 0.0 {
                    a.state = State::Idle;
                }
            }
            State::Rest => {
                let a = &mut self.agents[id];
                if arrived {
                    a.timer = if a.rest_t > 0.0 { a.rest_t } else { 10.0 };
                }
                a.energy += dt * if a.home.is_some() { 6.0 } else { 3.0 };
                if a.timer <= 0.0 || a.energy >= 100.0 {
                    a.energy = a.energy.min(100.0);
                    a.state = State::Idle;
                }
            }
            State::Soak => {
                let a = &mut self.agents[id];
                if arrived {
                    a.timer = 6.0;
                }
                a.joy += dt * 4.0;
                a.energy += dt * 2.0;
                if a.timer <= 0.0 {
                    a.state = State::Idle;
                }
            }
            State::Browse => {
                if arrived {
                    self.agents[id].timer = self.rng.range(4.0, 7.0);
                }
                self.agents[id].joy += dt * 2.5;
                if timer_done(self) {
                    self.agents[id].state = State::Idle;
                    if self.rng.chance(0.5) {
                        self.stock.metal += 0.5;
                    }
                }
            }
            State::Paint => {
                if arrived {
                    self.agents[id].timer = 14.0;
                }
                if timer_done(self) {
                    self.paint(id);
                }
            }
            State::Stargaze => {
                if arrived {
                    let timer = self.rng.range(12.0, 20.0);
                    let a = &mut self.agents[id];
                    a.timer = timer;
                    a.face = 1.0;
                }
                self.agents[id].joy += dt * 1.5;
                if !self.shooters.is_empty() && self.rng.chance(dt * 0.5) {
                    self.agents[id].joy += 6.0;
                    if self.rng.chance(0.3) {
                        let a = &self.agents[id];
                        let line = format!("{} saw a falling star from {}.", a.name, lv_name(a.l));
                        self.note(line);
                    }
                }
                if timer_done(self) || self.daylight() > 0.5 {
                    self.agents[id].state = State::Idle;
                }
            }
            State::Dine => {
                if arrived {
                    let face = if self.rng.chance(0.5) { 1.0 } else { -1.0 };
                    let bowl = self.rng.int(0, 2);
                    let a = &mut self.agents[id];
                    a.face = face;
                    a.bowl = bowl;
                    if a.hobby == Some(Hobby::Musician) && self.rng.chance(0.5) {
                        let line =
                            format!("{} brought the reed flute to supper.", self.agents[id].name);
                        self.log(line);
                    }
                }
                // A musician lifts everyone within earshot, about three times a second.
                if self.agents[id].hobby == Some(Hobby::Musician) && self.ticks.is_multiple_of(10) {
                    let px = self.agents[id].px;
                    for o in &mut self.agents {
                        if o.state == State::Dine && (o.px - px).abs() < 60.0 {
                            o.joy += 0.02;
                        }
                    }
                }
                let a = &mut self.agents[id];
                a.joy += dt * 2.2;
                a.energy += dt * 1.5;
                if self.supper <= 0.0 {
                    a.state = State::Idle;
                    a.timer = self.rng.range(0.5, 2.0);
                }
            }
            State::Festival => {
                if arrived {
                    self.agents[id].face = if self.rng.chance(0.5) { 1.0 } else { -1.0 };
                }
                self.agents[id].joy += dt * 2.5;
                if self.festival <= 0.0 {
                    let timer = self.rng.range(0.5, 3.0);
                    self.idle(id, timer);
                }
            }
            State::Dance => {
                let a = &mut self.agents[id];
                a.joy += dt * 3.0;
                a.dance += dt;
                if self.bell <= 0.0 {
                    a.state = State::Idle;
                    a.timer = 0.5;
                }
            }
            State::Walk => {}
        }

        let a = &mut self.agents[id];
        a.energy = a.energy.clamp(0.0, 100.0);
        a.joy = a.joy.clamp(0.0, 100.0);
    }

    fn walk(&mut self, id: AgentId, dt: f64) {
        let bustle = self.p.bustle / 100.0;
        let a = &self.agents[id];
        let spd = bustle * 24.0 * if a.energy < 30.0 { 0.7 } else { 1.0 };

        let Some(&(ns, nl)) = a.path.front() else {
            let a = &mut self.agents[id];
            let dx = a.tx.unwrap_or(a.px) - a.px;
            if dx.abs() > 1.0 {
                a.face = dx.signum();
                a.px += dx.signum() * dx.abs().min(spd * dt);
                return;
            }
            a.state = a.next;
            a.arrive = true;
            a.climbing = Climb::None;
            return;
        };

        // A hop to a cell that is not adjacent is a gondola ride between cable stations.
        if (ns - a.s).abs() > 1 || (nl != a.l && ns != a.s) {
            let a = &mut self.agents[id];
            let (tx, ty) = (center(ns), feet_y(nl));
            let (dx, dy) = (tx - a.px, ty - a.py);
            let d = dx.hypot(dy);
            let vs = 28.0 * bustle;
            a.climbing = Climb::Gondola;
            if dx != 0.0 {
                a.face = dx.signum();
            }
            if d <= vs * dt {
                a.px = tx;
                a.py = ty;
                a.s = ns;
                a.l = nl;
                a.path.pop_front();
                a.climbing = Climb::None;
            } else {
                a.px += dx / d * vs * dt;
                a.py += dy / d * vs * dt;
            }
            return;
        }

        if nl != a.l {
            let cx = center(a.s);
            let dx = cx - a.px;
            if dx.abs() > 1.0 {
                let a = &mut self.agents[id];
                a.face = dx.signum();
                a.px += dx.signum() * dx.abs().min(spd * dt);
                return;
            }
            let closer = if a.l.abs() < nl.abs() { a.l } else { nl };
            let climbing = match self.kind_at(a.s, closer) {
                Some(Kind::Lift) => Climb::Lift,
                Some(Kind::Mineshaft) => Climb::Hoist,
                _ => Climb::Stairs,
            };
            let vs = bustle
                * match climbing {
                    Climb::Lift => 30.0,
                    Climb::Hoist => 22.0,
                    _ => 14.0,
                };
            let a = &mut self.agents[id];
            a.px = cx;
            a.climbing = climbing;
            let dy = feet_y(nl) - a.py;
            if dy.abs() <= vs * dt {
                a.py = feet_y(nl);
                a.l = nl;
                a.path.pop_front();
                a.climbing = Climb::None;
            } else {
                a.py += dy.signum() * vs * dt;
            }
            return;
        }

        let a = &mut self.agents[id];
        let dx = center(ns) - a.px;
        if dx != 0.0 {
            a.face = dx.signum();
        }
        if dx.abs() <= spd * dt {
            a.px = center(ns);
            a.s = ns;
            a.path.pop_front();
        } else {
            a.px += dx.signum() * spd * dt;
        }
    }

    fn harvest(&mut self, id: AgentId) {
        use Species::Minnow;
        self.agents[id].carry = None;
        let res = self.agents[id].res;
        let dil = self.agents[id].dil;

        match self.agents[id].src {
            Some(Source::Room(r)) if self.rooms[r].kind.is_wild() => {
                let lagoon = self.rooms[r].kind == Kind::Lagoon;
                if lagoon && self.rooms[r].n(Minnow) > 5.0 && self.rng.chance(0.6) {
                    *self.rooms[r].n_mut(Minnow) -= 2.0;
                    self.carry(id, Resource::Leaf, 3.0);
                    if self.rng.chance(0.5) {
                        let line = format!(
                            "{} netted two minnows from the tide atrium.",
                            self.agents[id].name
                        );
                        self.log(line);
                    }
                } else if self.rooms[r].plants > 20.0 {
                    let taken = 3.0 + self.p.harvest * 0.3;
                    let room = &mut self.rooms[r];
                    room.plants = (room.plants - taken).max(0.0);
                    room.harvested += taken;
                    self.carry(id, Resource::Leaf, if lagoon { 3.0 } else { 2.0 });
                }
            }
            Some(src) => {
                let amt = match src {
                    Source::Tree(i) => &mut self.trees[i].amt,
                    Source::Rubble(s) => &mut self.street[s as usize].amt,
                    Source::Room(r) => &mut self.rooms[r].amt,
                };
                if *amt > 0 {
                    *amt -= 1;
                    let mut n = 1.0;
                    if *amt > 0 && dil > 0.7 {
                        *amt -= 1;
                        n += 1.0;
                    }
                    let left = *amt;
                    if let Source::Room(r) = src
                        && self.rooms[r].kind == Kind::Gallery
                    {
                        if res == Resource::Metal && self.count(Kind::Foundry) > 0 {
                            n += 1.0;
                        }
                        if left <= 0 {
                            let room = &mut self.rooms[r];
                            room.kind = Kind::Cave;
                            room.amt = 0;
                            room.grow = 0.0;
                            self.changed = true;
                            let line = format!(
                                "The gallery on {} is spent. Mushrooms already.",
                                lv_name(self.rooms[r].l)
                            );
                            self.log(line);
                        }
                    }
                    self.carry(id, res, n);
                }
            }
            None => {}
        }

        if self.agents[id].carry.is_some() {
            let hub = self.rng.pick(&HUB);
            self.go_to(id, (hub, 0), State::Deposit, Spot::Scatter);
        } else {
            self.agents[id].state = State::Idle;
        }
    }

    fn carry(&mut self, id: AgentId, res: Resource, n: f64) {
        let a = &mut self.agents[id];
        a.carry = Some(res);
        a.carry_n = n;
    }

    fn build(&mut self, id: AgentId, arrived: bool, dt: f64) {
        if arrived {
            let a = &mut self.agents[id];
            a.timer = a.work_t;
        }
        let project = self.agents[id]
            .proj
            .and_then(|pid| self.projects.iter().position(|p| p.id == pid));
        let Some(project) = project else {
            self.agents[id].state = State::Idle;
            return;
        };
        let relics = self
            .rooms
            .iter()
            .filter(|b| b.find == Some(Find::Relic))
            .count() as f64;
        let a = &self.agents[id];
        let boost = 1.0
            + 0.35 * self.countf(Kind::Workshop)
            + 0.25 * relics
            + if a.hobby == Some(Hobby::Tinker) {
                0.3
            } else {
                0.0
            };
        let progress = dt * boost * (0.6 + a.dil * 0.6);
        let p = &mut self.projects[project];
        p.progress += progress;
        if p.progress >= p.work {
            self.finish_project(project, id);
            let a = &mut self.agents[id];
            a.state = State::Idle;
            a.joy += 8.0;
        } else if self.agents[id].timer <= 0.0 {
            self.agents[id].state = State::Idle;
        }
    }

    fn chat(&mut self, id: AgentId) {
        let timer = self.rng.range(2.0, 4.0);
        let a = &mut self.agents[id];
        a.timer = timer;
        a.joy += 6.0;
        let Some(buddy) = a.buddy else { return };

        let buddy_px = self.agents[buddy].px;
        self.agents[buddy].joy += 4.0;
        let a = &mut self.agents[id];
        let dx = buddy_px - a.px;
        a.face = if dx == 0.0 { 1.0 } else { dx.signum() };
        if a.bond.len() <= buddy {
            a.bond.resize(buddy + 1, 0);
        }
        a.bond[buddy] += 1;

        if a.bond[buddy] == 6 {
            let (name, buddy_name) = (a.name.clone(), self.agents[buddy].name.clone());
            self.note(format!("{name} and {buddy_name} are inseparable now."));
            let shared = self.agents[id].home.or(self.agents[buddy].home);
            if let Some(home) = shared
                && self.residents(home) < 2
            {
                self.agents[id].home.get_or_insert(home);
                self.agents[buddy].home.get_or_insert(home);
                let level = self.home_node(home).1;
                self.log(format!("{buddy_name} moved in on {}.", lv_name(level)));
            }
        } else if self.rng.chance(0.25) {
            let line = format!(
                "{} and {} are trading rumours.",
                self.agents[id].name, self.agents[buddy].name
            );
            self.log(line);
        }
    }

    fn paint(&mut self, id: AgentId) {
        let Some(Home::Room(home)) = self.agents[id].home else {
            self.agents[id].state = State::Idle;
            return;
        };
        let theme = self.rng.pick(&[
            "the tide",
            "the grove",
            "a heron",
            "the old world",
            "rain",
            "the mine",
        ]);
        self.rooms[home].mural = Some(Mural {
            seed: self.rng.unit(),
            theme,
        });
        self.changed = true;
        let paint_t = self.rng.range(600.0, 1200.0);
        let level = self.rooms[home].l;
        let a = &mut self.agents[id];
        a.paint_t = paint_t;
        a.joy += 12.0;
        a.state = State::Idle;
        let line = format!(
            "{} painted a mural of {theme} on {}.",
            a.name,
            lv_name(level)
        );
        self.note(line);
    }
}
