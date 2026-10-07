use super::defs::*;
use super::world::*;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Plot {
    /// An ordinary cell on top of a tower.
    Above,
    /// An ordinary cell below the street, under a shaft or beside a dug-out cell.
    Below {
        side: bool,
    },
    Hall,
    Wild,
    Cottage,
    Grand,
    Lagoon,
    Atrium,
    Bridge,
}

#[derive(Clone)]
struct Site {
    plot: Plot,
    s: i32,
    l: i32,
    score: f64,
    on_shaft: bool,
    cells: Vec<Node>,
    host: Option<RoomId>,
    cx: i32,
    lvl: i32,
    tier: i32,
    w: i32,
    h: i32,
}

impl Site {
    fn new(plot: Plot, s: i32, l: i32, score: f64) -> Self {
        Self {
            plot,
            s,
            l,
            score,
            on_shaft: false,
            cells: Vec::new(),
            host: None,
            cx: 0,
            lvl: 0,
            tier: 0,
            w: 0,
            h: 0,
        }
    }

    /// A spot the council would consider for founding the Wild.
    fn could_found_wild(&self) -> bool {
        !matches!(self.plot, Plot::Bridge | Plot::Below { .. } | Plot::Hall)
            && self.l <= 8
            && !HUB.contains(&self.s)
            && self.s > 2
            && self.s < SLOTS - 1
    }
}

fn block(s: i32, l: i32, w: i32, h: i32) -> Vec<Node> {
    (0..w)
        .flat_map(|dx| (0..h).map(move |dy| (s + dx, l + dy)))
        .collect()
}

impl World {
    /// Cells of a proposed multi-cell wild structure are free, and do not bury
    /// an ordinary tower.
    fn block_is_free(&self, cells: &[Node], l: i32) -> bool {
        if cells
            .iter()
            .any(|&(s, l)| self.occupied(s, l) || self.project_at(s, l))
        {
            return false;
        }
        if l == 1 && cells.iter().any(|(s, _)| HUB.contains(s)) {
            return false;
        }
        !cells
            .iter()
            .any(|&(s, l)| self.height_of(s) >= l && !self.wild_slots.contains(&s))
    }

    fn block_touches(&self, cells: &[Node], above_too: bool, only_wild_floors: bool) -> bool {
        cells.iter().any(|&(s, l)| {
            let mut around = vec![(s - 1, l), (s + 1, l), (s, l - 1)];
            if above_too {
                around.push((s, l + 1));
            }
            around.into_iter().any(|(ns, nl)| {
                self.room_id_at(ns, nl).is_some_and(|n| {
                    if only_wild_floors {
                        self.rooms[n].kind == Kind::Wild
                    } else {
                        self.rooms[self.main_of(n)].kind.is_wild()
                    }
                })
            })
        })
    }

    fn block_has_access(&self, cells: &[Node]) -> bool {
        cells
            .iter()
            .any(|&(s, l)| !self.access_nodes(s, l).is_empty())
    }

    fn site_candidates(&mut self) -> Vec<Site> {
        let p = &self.p;
        let (wild, climb, depths, homes) = (
            p.wild / 50.0,
            p.climb / 50.0,
            p.depths / 50.0,
            p.homes / 50.0,
        );
        let mut out = Vec::new();

        let ore_left: i32 = self
            .rooms
            .iter()
            .filter(|m| m.kind == Kind::Gallery)
            .map(|m| m.amt)
            .sum();
        let mine_mul = match ore_left {
            n if n > 24 => 0.12,
            n if n > 12 => 0.5,
            _ => 1.0,
        };
        let pods = self.pod_count();
        let wild_mul = match pods {
            n if n >= 24 => 0.3,
            n if n >= 8 => 0.5,
            _ => 1.0,
        };
        let crowded = self.agents.len() >= self.capacity();
        let has_project = |w: &World, kind: Kind| w.projects.iter().any(|p| p.kind == kind);

        // The supper hall comes before anything else.
        if self.find_kind(Kind::Hall).is_none() && !has_project(self, Kind::Hall) {
            for s in [8, 4, 9, 3, 10] {
                let cells = vec![(s, 1), (s + 1, 1)];
                if cells.iter().any(|&(cs, cl)| {
                    self.occupied(cs, cl) || self.project_at(cs, cl) || HUB.contains(&cs)
                }) {
                    continue;
                }
                return vec![Site {
                    cells,
                    ..Site::new(Plot::Hall, s, 1, 1.0)
                }];
            }
        }

        for s in CITY {
            let marked = self.marker == Some(s);

            let top = self.height_of(s);
            let l = top + 1;
            if l <= LEVELS {
                let below = self.kind_at(s, top).map(|k| k.def());
                let capped = below.as_ref().is_some_and(|d| d.cap || d.bridge);
                if !capped && !self.project_at(s, l) && !self.access_nodes(s, l).is_empty() {
                    let on_shaft = below.is_some_and(|d| d.conn);
                    let base = if self.wild_slots.contains(&s) {
                        wild * 2.2 * wild_mul
                    } else {
                        1.4 + climb * l as f64 * 0.3 + if crowded { 1.2 } else { 0.0 }
                    };
                    let score = base
                        + if marked { 4.0 } else { 0.0 }
                        + if top == 0 { 0.6 } else { 0.0 }
                        + if on_shaft { 1.5 } else { 0.0 };
                    out.push(Site {
                        on_shaft,
                        ..Site::new(Plot::Above, s, l, score)
                    });
                }
            }

            let bot = self.depth_of(s);
            let d = -(bot + 1);
            if bot < DEPTH {
                let shaft_ok = bot == 0 || self.kind_at(s, -bot).is_some_and(|k| k.def().conn);
                if shaft_ok && !self.project_at(s, d) && !self.access_nodes(s, d).is_empty() {
                    let on_shaft = bot > 0;
                    let score = (depths * (0.8 + (bot + 1) as f64 * 0.25)
                        + if self.stock.metal < 8.0 { 1.2 } else { 0.0 }
                        + if marked { 2.0 } else { 0.0 }
                        + if on_shaft { 1.0 } else { 0.0 })
                        * mine_mul;
                    out.push(Site {
                        on_shaft,
                        ..Site::new(Plot::Below { side: false }, s, d, score)
                    });
                }
            }

            for l in (-DEPTH..=-1).rev() {
                if self.room_id_at(s, l).is_none() || !self.reachable(s, l) {
                    continue;
                }
                for ns in [s - 1, s + 1] {
                    if !is_city(ns) || self.occupied(ns, l) || self.project_at(ns, l) {
                        continue;
                    }
                    let score = (depths * (0.9 + (-l) as f64 * 0.15)
                        + if self.stock.metal < 8.0 { 1.0 } else { 0.0 })
                        * mine_mul;
                    out.push(Site::new(Plot::Below { side: true }, ns, l, score));
                }
            }
        }

        // The Wild spreads sideways from its existing floors.
        let floors = self.wild_floors();
        for &f in &floors {
            let (fs, fl) = (self.rooms[f].s, self.rooms[f].l);
            for ns in [fs - 1, fs + 1] {
                let in_wild = self.wild_slots.contains(&ns);
                if !is_city(ns)
                    || self.occupied(ns, fl)
                    || self.projects.iter().any(|p| p.s == ns && p.l == fl)
                    || (HUB.contains(&ns) && fl < 2)
                    || (!in_wild && self.wild_slots.len() >= 3)
                    || (!in_wild && self.height_of(ns) >= fl)
                    || !self.reachable(fs, fl)
                {
                    continue;
                }
                let score = wild
                    * if floors.len() < 6 { 1.8 } else { 0.5 }
                    * if in_wild { 1.0 } else { 0.7 }
                    * wild_mul;
                out.push(Site::new(Plot::Wild, ns, fl, score));
            }
        }

        if !has_project(self, Kind::Cottage) {
            for host in 0..self.rooms.len() {
                if let Some(site) = self.cottage_site(host, homes, crowded) {
                    out.push(site);
                }
            }
        }

        let grands = self.grand_count();
        if self.find_kind(Kind::Atrium).is_some()
            && !has_project(self, Kind::Grand)
            && grands < 4
            && pods >= 8 + 4 * grands
        {
            let tier = grands + 1;
            let (gw, gh) = ((2 + tier).min(5), 3 + tier);
            for s in 2..=SLOTS - gw {
                for l in 1..=LEVELS - gh + 1 {
                    let cells = block(s, l, gw, gh);
                    if !self.block_is_free(&cells, l) {
                        continue;
                    }
                    let touching = self.block_touches(&cells, false, false);
                    if (!touching && l != 1) || !self.block_has_access(&cells) {
                        continue;
                    }
                    let score = wild * if touching { 3.2 } else { 0.9 };
                    out.push(Site {
                        tier,
                        w: gw,
                        h: gh,
                        cells,
                        ..Site::new(Plot::Grand, s, l, score)
                    });
                }
            }
        }

        if !self.wild_slots.is_empty()
            && self.find_kind(Kind::Lagoon).is_none()
            && !has_project(self, Kind::Lagoon)
            && pods >= 6
        {
            for s in 2..SLOTS - 1 {
                for l in 1..=LEVELS - 2 {
                    let cells = block(s, l, 2, 3);
                    if !self.block_is_free(&cells, l)
                        || !self.block_touches(&cells, false, false)
                        || !self.block_has_access(&cells)
                    {
                        continue;
                    }
                    out.push(Site {
                        cells,
                        ..Site::new(Plot::Lagoon, s, l, wild * 2.6)
                    });
                }
            }
        }

        if !self.wild_slots.is_empty()
            && self.find_kind(Kind::Atrium).is_none()
            && !has_project(self, Kind::Atrium)
            && pods >= 4
        {
            for s in 2..SLOTS - 1 {
                for l in 1..=LEVELS - 2 {
                    let cells = block(s, l, 2, 3);
                    if !self.block_is_free(&cells, l) {
                        continue;
                    }
                    let touching = self.block_touches(&cells, true, true);
                    if (!touching && l != 1) || !self.block_has_access(&cells) {
                        continue;
                    }
                    let score = wild * if touching { 2.5 } else { 0.6 };
                    out.push(Site {
                        cells,
                        ..Site::new(Plot::Atrium, s, l, score)
                    });
                }
            }
        }

        // A bridge spans a gap between two towers.
        for s in 3..SLOTS - 1 {
            for l in 2..=LEVELS {
                if self.occupied(s, l) || self.occupied(s, l - 1) || self.project_at(s, l) {
                    continue;
                }
                let (Some(left), Some(right)) = (self.kind_at(s - 1, l), self.kind_at(s + 1, l))
                else {
                    continue;
                };
                if left.def().bridge || right.def().bridge {
                    continue;
                }
                let (rl, rr) = (self.reachable(s - 1, l), self.reachable(s + 1, l));
                if !rl && !rr {
                    continue;
                }
                let score = if rl != rr { 3.0 } else { 0.8 } + l as f64 * 0.1;
                out.push(Site::new(Plot::Bridge, s, l, score));
            }
        }
        out
    }

    /// A free spot for a cottage on one of the terraces inside an atrium.
    fn cottage_site(&mut self, host: RoomId, homes: f64, crowded: bool) -> Option<Site> {
        let b = &self.rooms[host];
        let grand = match b.kind {
            Kind::Atrium => false,
            Kind::Grand => true,
            _ => return None,
        };
        let (bs, bl, tier) = (b.s, b.l, b.tier);
        let (w, h) = if grand {
            (b.w * SW as i32, b.h)
        } else {
            (80, 3)
        };
        let max = if grand { (b.w * b.h) / 4 } else { 2 };
        if b.cottages.len() as i32 >= max {
            return None;
        }

        for _ in 0..12 {
            let lvl = self.rng.int(0, h - 1);
            let (mut x0, mut x1) = (8, w - 20);
            if grand && lvl > 0 {
                // Terraces alternate sides as they go up.
                let terrace = round(w as f64 * 0.55) as i32;
                if lvl % 2 == 1 {
                    (x0, x1) = (4, terrace - 14);
                } else {
                    (x0, x1) = (w - terrace + 4, w - 16);
                }
            }
            if grand && tier >= 2 && lvl == 0 {
                x1 = x1.min(w - 30);
            }
            let cx = self.rng.int(x0, x1);
            if ((cx + 6) as f64 - w as f64 / 2.0).abs() < 8.0 && lvl == 0 {
                continue;
            }
            let taken = self.rooms[host].cottages.iter().any(|&c| {
                let c = &self.cottages[c];
                c.lvl == lvl && (c.cx - cx).abs() < 18
            });
            if taken {
                continue;
            }
            let s = slot_of(bs as f64 * SW + cx as f64 + 6.0);
            let l = bl + lvl;
            if !self.reachable(s, l) {
                continue;
            }
            let score = homes * if crowded { 3.2 } else { 0.7 };
            return Some(Site {
                host: Some(host),
                cx,
                lvl,
                ..Site::new(Plot::Cottage, s, l, score)
            });
        }
        None
    }

    /// The council picks a site and something to build there.
    pub fn plan(&mut self) {
        let max_projects = 1 + self.count(Kind::Workshop).min(2);
        if self.projects.len() >= max_projects {
            return;
        }
        let candidates = self.site_candidates();
        if candidates.is_empty() {
            return;
        }
        let weights: Vec<(usize, f64)> = candidates
            .iter()
            .enumerate()
            .map(|(i, c)| (i, c.score))
            .collect();
        let mut site = candidates[self.rng.weighted(&weights)].clone();

        let has_hall = self.find_kind(Kind::Hall).is_some();
        if self.wild_slots.is_empty() && has_hall && self.rng.chance(self.p.wild / 100.0) {
            let eligible: Vec<usize> = (0..candidates.len())
                .filter(|&i| candidates[i].could_found_wild())
                .collect();
            if !eligible.is_empty() {
                site = candidates[self.rng.pick(&eligible)].clone();
            }
        }

        let marked = self.marker == Some(site.s);
        if self.wild_slots.is_empty()
            && has_hall
            && site.could_found_wild()
            && self.rng.chance(0.75 + if marked { 0.3 } else { 0.0 })
        {
            self.wild_slots = vec![site.s];
            let from = if site.l == 1 {
                "from the street".to_string()
            } else {
                format!("above {}", lv_name(site.l - 1))
            };
            self.note(format!(
                "The council founds the Wild on tower {}, {from}.",
                site.s - 1
            ));
        }

        let mut weights = self.building_weights(&site);
        let n = |k| self.countf(k);
        let light_rate = 0.02
            + n(Kind::Solar) * 0.06
            + n(Kind::Wind) * 0.03
            + n(Kind::Geo) * 0.1
            + n(Kind::Turbine) * 0.05;
        // Nothing the town could not light within a few minutes.
        for (kind, w) in &mut weights {
            if kind.def().cost.light > self.stock.light + light_rate * 150.0 {
                *w = 0.0;
            }
        }
        if weights.iter().map(|(_, w)| w).sum::<f64>() <= 0.0 {
            return;
        }
        let kind = self.rng.weighted(&weights);

        let def = kind.def();
        let mut project = Project {
            id: self.next_project_id,
            kind,
            s: site.s,
            l: site.l,
            cost: def.cost,
            work: def.work,
            progress: 0.0,
            funded: false,
            age: 0.0,
            cells: site.cells.clone(),
            host: site.host,
            cx: site.cx,
            lvl: site.lvl,
            tier: site.tier,
            w: site.w,
            h: site.h,
        };
        if site.plot == Plot::Grand {
            let tier = site.tier as f64;
            project.cost = Cost {
                metal: 10.0 + 8.0 * tier,
                leaf: 12.0 + 8.0 * tier,
                light: 4.0 + 5.0 * tier,
            };
            project.work = 50.0 + 35.0 * tier;
        }
        self.next_project_id += 1;
        self.projects.push(project);
        self.changed = true;

        let line = match kind {
            Kind::Cottage => {
                let host = &self.rooms[site.host.expect("cottage sites have a host")];
                let place = if host.kind == Kind::Grand {
                    GRAND_NAMES[(host.tier - 1) as usize]
                } else {
                    "the cedar atrium"
                };
                format!("The council votes for a cottage inside {place}.")
            }
            Kind::Grand => format!(
                "The council votes for something bigger: {}, {} towers wide and {} storeys tall.",
                GRAND_NAMES[(site.tier - 1) as usize],
                site.w,
                site.h
            ),
            Kind::Hall => {
                "First things first: the council votes for a supper hall by the hub.".to_string()
            }
            _ => format!(
                "Council votes for a {} on {}{}.",
                kind.lower_name(),
                lv_name(site.l),
                if marked { " (your tower)" } else { "" }
            ),
        };
        self.log(line);
    }

    fn building_weights(&self, site: &Site) -> Vec<(Kind, f64)> {
        use Kind::*;
        let p = &self.p;
        let n = |k| self.countf(k);
        let (energy, gardens, wonders, climb, depths, homes) = (
            p.energy / 50.0,
            p.gardens / 50.0,
            p.wonders / 50.0,
            p.climb / 50.0,
            p.depths / 50.0,
            p.homes / 50.0,
        );
        let l = site.l;
        let lf = l as f64;
        let when = |cond: bool, a: f64, b: f64| if cond { a } else { b };
        let shafts_on_level = CITY
            .filter(|&s| self.kind_at(s, l).is_some_and(|k| k.def().conn))
            .count();

        match site.plot {
            Plot::Hall => vec![(Hall, 1.0)],
            Plot::Bridge => vec![(Bridge, 1.0)],
            Plot::Cottage => vec![(Cottage, 1.0)],
            Plot::Grand => vec![(Grand, 1.0)],
            Plot::Lagoon => vec![(Lagoon, 1.0)],
            Plot::Atrium => vec![(Atrium, 1.0)],
            Plot::Wild => vec![(Wild, 1.0)],
            Plot::Above if self.wild_slots.contains(&site.s) => {
                let floors = self.wild_floors();
                let wf = floors.len();
                let column = floors
                    .iter()
                    .filter(|&&f| self.rooms[f].s == site.s)
                    .count();
                let pods = self.pod_count();
                let has_lagoon = self.find_kind(Lagoon).is_some();
                let want_marsh = pods >= 4
                    && self.wild_slots.len() >= 2
                    && (self.count(Marsh) as i32) < 1 + pods / 5 + i32::from(has_lagoon);
                let tall = column >= 2 && wf >= 6;
                vec![
                    (
                        Wild,
                        if wf < 6 {
                            2.0
                        } else if wf < 10 {
                            0.6 * (p.wild / 50.0)
                        } else {
                            0.1
                        },
                    ),
                    (Dome, when(tall, when(want_marsh, 0.8, 2.5), 0.0)),
                    (Marsh, when(column >= 2 && l >= 2 && want_marsh, 2.2, 0.0)),
                ]
            }
            Plot::Below { side } => {
                let d = -l;
                let off_shaft = when(side, 1.0, 0.5);
                let shaft = if side {
                    0.05
                } else {
                    when(site.on_shaft, when(d < DEPTH, 3.0, 0.0), 2.5)
                        * when(shafts_on_level >= 1 && !site.on_shaft, 0.2, 1.0)
                };
                vec![
                    (Mineshaft, shaft),
                    (
                        Gallery,
                        when(side, 1.5, 0.9) * when(self.stock.metal < 10.0, 1.4, 0.8),
                    ),
                    (
                        Pump,
                        when(
                            d >= 2,
                            energy
                                * when(n(Pump) < 1.0 + (n(Garden) / 4.0).floor(), 1.0, 0.1)
                                * off_shaft,
                            0.0,
                        ),
                    ),
                    (
                        Geo,
                        when(
                            d >= 3,
                            energy
                                * when(
                                    n(Geo) < (self.city_depth() as f64 / 2.0).floor(),
                                    1.2,
                                    0.15,
                                )
                                * off_shaft,
                            0.0,
                        ),
                    ),
                    (
                        Foundry,
                        when(
                            d >= 2,
                            depths
                                * when(n(Foundry) == 0.0 && n(Gallery) >= 2.0, 1.2, 0.05)
                                * when(side, 1.0, 0.4),
                            0.0,
                        ),
                    ),
                ]
            }
            Plot::Above => {
                let pop = self.agents.len() as f64;
                let cap = self.capacity() as f64;
                let conn_w = if site.on_shaft {
                    when(shafts_on_level >= 1, 1.0, 5.0)
                } else if shafts_on_level > 0 {
                    when(shafts_on_level >= 2, 0.05, 0.3)
                } else {
                    1.4
                };
                let water_short = self.stock.water < self.water_cap * 0.3;
                let water_full = self.stock.water > self.water_cap * 0.85;
                let roof = !site.on_shaft;
                let cables = self.count(Cable);
                let far_towers = CITY
                    .filter(|&s| (s - site.s).abs() >= 3 && self.height_of(s) >= 3)
                    .count();
                vec![
                    (Home, homes * when(pop >= cap, 3.0, 0.6)),
                    (Garden, gardens * when(n(Garden) < pop / 2.0, 1.4, 0.5)),
                    (
                        Solar,
                        energy * when(self.stock.light < 8.0, 3.2, 0.6) * (1.0 + lf * 0.08),
                    ),
                    (Workshop, energy * when(n(Workshop) == 0.0, 0.9, 0.15)),
                    (
                        Wind,
                        when(
                            l >= 3,
                            energy * when(n(Wind) < n(Solar) / 2.0, 0.9, 0.25) * (lf / 4.0),
                            0.0,
                        ),
                    ),
                    (
                        Tank,
                        gardens
                            * when(water_full || n(Tank) < (n(Catcher) / 2.0).floor(), 1.1, 0.2),
                    ),
                    (
                        Turbine,
                        energy * when(water_full && n(Turbine) < n(Tank) + 1.0, 1.3, 0.15),
                    ),
                    (
                        Market,
                        when(n(Market) < (pop / 6.0).floor() + 1.0, 0.7, 0.1),
                    ),
                    (Bath, wonders * when(n(Bath) == 0.0, 1.2, 0.15)),
                    (
                        Library,
                        wonders * when(n(Library) < (pop / 7.0).floor(), 0.9, 0.15),
                    ),
                    (
                        Catcher,
                        when(
                            roof && l >= 2,
                            gardens
                                * when(
                                    water_short || n(Catcher) < 1.0 + (n(Garden) / 2.0).floor(),
                                    1.6,
                                    0.1,
                                )
                                * (p.rain / 50.0),
                            0.0,
                        ),
                    ),
                    (
                        Dome,
                        when(
                            roof && l >= 3,
                            wonders * when(n(Dome) < (pop / 8.0).floor(), 0.8, 0.1),
                            0.0,
                        ),
                    ),
                    (
                        Beacon,
                        when(
                            roof && l >= 4,
                            wonders
                                * when(
                                    n(Beacon) < (self.city_height() as f64 / 6.0).floor(),
                                    1.2,
                                    0.15,
                                ),
                            0.0,
                        ),
                    ),
                    (
                        Battery,
                        energy * when(self.stock.light > self.light_cap * 0.8, 1.6, 0.2),
                    ),
                    (
                        Apiary,
                        gardens
                            * when(
                                n(Garden) >= 2.0 && n(Apiary) < (n(Garden) / 3.0).ceil(),
                                1.1,
                                0.1,
                            ),
                    ),
                    (
                        Loom,
                        wonders * when(n(Loom) == 0.0 && pop >= 8.0, 1.0, 0.05),
                    ),
                    (
                        Aviary,
                        wonders * when(!self.wild_slots.is_empty() && n(Aviary) == 0.0, 0.9, 0.05),
                    ),
                    (
                        Cable,
                        when(
                            roof && l >= 2 && (cables % 2 == 1 || far_towers > 0) && cables < 4,
                            climb * 2.4,
                            0.0,
                        ),
                    ),
                    (
                        Mistnet,
                        when(
                            roof && l >= 3,
                            gardens * when(n(Mistnet) < 1.0 + (n(Garden) / 4.0).floor(), 0.8, 0.1),
                            0.0,
                        ),
                    ),
                    (
                        Belltower,
                        when(
                            roof && l >= 4,
                            wonders * when(n(Belltower) == 0.0, 0.7, 0.0),
                            0.0,
                        ),
                    ),
                    (
                        Pier,
                        when(
                            roof && l >= 5,
                            wonders * when(n(Pier) == 0.0, 0.9, 0.0),
                            0.0,
                        ),
                    ),
                    (
                        Observatory,
                        when(
                            roof && l >= 6,
                            wonders * when(n(Observatory) == 0.0, 0.9, 0.0),
                            0.0,
                        ),
                    ),
                    (Stairs, climb * conn_w * when(l <= 2, 1.0, 0.4)),
                    (Lift, climb * conn_w * when(l >= 2, 1.2, 0.6)),
                ]
            }
        }
    }

    /// Unfunded projects wait for materials, and are shelved if they wait too long.
    pub fn fund_projects(&mut self) {
        let mut shelved = Vec::new();
        self.projects.retain_mut(|p| {
            if p.funded {
                return true;
            }
            p.age += 1.0 / 30.0;
            if p.age > 240.0 {
                shelved.push(p.kind);
                return false;
            }
            true
        });
        for kind in shelved {
            self.changed = true;
            self.log(format!(
                "The council shelves the {} for now.",
                kind.lower_name()
            ));
        }

        let mut funded = Vec::new();
        for p in self.projects.iter_mut().filter(|p| !p.funded) {
            let s = &mut self.stock;
            if s.leaf >= p.cost.leaf && s.metal >= p.cost.metal && s.light >= p.cost.light {
                s.leaf -= p.cost.leaf;
                s.metal -= p.cost.metal;
                s.light -= p.cost.light;
                p.funded = true;
                funded.push(p.kind);
            }
        }
        for kind in funded {
            self.changed = true;
            self.log(format!(
                "Materials set aside for the {}.",
                kind.lower_name()
            ));
        }
    }

    pub fn finish_project(&mut self, index: usize, builder: AgentId) {
        use Species::*;
        let p = self.projects.remove(index);
        let name = self.agents[builder].name.clone();
        self.changed = true;

        if p.kind == Kind::Cottage {
            let host = p.host.expect("cottage projects have a host");
            let x = self.rooms[host].s as f64 * SW + p.cx as f64 + 6.0;
            let id = self.cottages.len();
            self.cottages.push(Cottage {
                host,
                cx: p.cx,
                lvl: p.lvl,
                s: p.s,
                l: p.l,
                x,
                seed: self.rng.unit(),
                age: 0.0,
            });
            self.rooms[host].cottages.push(id);
            self.house_homeless(Home::Cottage(id));
            self.effects.push(Effect::CottageBuilt {
                x,
                y: feet_y(p.l) - 6.0,
            });
            self.note(format!(
                "{name} finished a cottage under the leaves on {}.",
                lv_name(p.l)
            ));
            self.agents[builder].joy += 8.0;
            return;
        }

        let seed = self.rng.unit();
        let mut room = Room::new(p.kind, p.s, p.l, seed);
        if matches!(p.kind, Kind::Wild | Kind::Marsh) && !self.wild_slots.contains(&p.s) {
            self.wild_slots.push(p.s);
        }
        let part = match p.kind {
            Kind::Hall => Some(Kind::HallPart),
            Kind::Grand => Some(Kind::GrandPart),
            Kind::Lagoon => Some(Kind::LagoonPart),
            Kind::Atrium => Some(Kind::AtriumPart),
            _ => None,
        };
        match p.kind {
            Kind::Grand => {
                room.tier = p.tier;
                room.w = p.w;
                room.h = p.h;
                let spacing = ((p.w * 40 - 24) as f64) / p.w as f64;
                room.cedars = (0..=p.w)
                    .map(|i| Cedar {
                        x: 12.0 + i as f64 * spacing,
                        h: 0.1 + self.rng.unit() * 0.1,
                        seed: self.rng.unit(),
                    })
                    .collect();
                room.plants = 40.0;
                *room.n_mut(Finch) = 2.0;
                *room.n_mut(Moth) = 3.0;
            }
            Kind::Lagoon => {
                room.plants = 30.0;
                *room.n_mut(Minnow) = 3.0;
                room.level = 0.2;
            }
            Kind::Atrium => {
                room.cedars = (0..5)
                    .map(|i| Cedar {
                        x: (8 + i * 15 + self.rng.int(-3, 3)) as f64,
                        h: 0.08 + self.rng.unit() * 0.1,
                        seed: self.rng.unit(),
                    })
                    .collect();
                room.plants = 35.0;
            }
            _ => {}
        }
        if part.is_some() {
            room.cells = p.cells.clone();
        }

        let id = self.place(room);
        if let Some(part) = part {
            for &(s, l) in &p.cells {
                if (s, l) == (p.s, p.l) {
                    continue;
                }
                // The tank of the tide atrium is full of water; only its gallery can be walked.
                let solid = p.kind == Kind::Lagoon && l > p.l;
                self.place_part(part, (s, l), id, solid);
                if p.kind != Kind::Hall && !self.wild_slots.contains(&s) {
                    self.wild_slots.push(s);
                }
            }
        }
        self.compute_reach();

        match p.kind {
            Kind::Hall => {
                self.log("The supper hall is up. Long table, warm pot, room for everyone.")
            }
            Kind::Grand => self.note(format!(
                "{} is finished: {} towers wide, {} storeys, terraces all the way up.",
                GRAND_NAMES[(p.tier - 1) as usize],
                p.w,
                p.h
            )),
            Kind::Lagoon => {
                self.log("The tide atrium is sealed and nearly dry. It needs marsh rain.")
            }
            Kind::Home => self.house_homeless(Home::Room(id)),
            Kind::Tank => self.water_cap += 30.0,
            Kind::Catcher => self.water_cap += 10.0,
            Kind::Belltower => self.note("A bell tower. The whole town will hear it at dawn."),
            Kind::Pier => {
                self.ship.next_day = self.ship.next_day.min(self.day + 1);
                self.note("A sky pier. Airships will find it.");
            }
            Kind::Cable => self.pair_cable(id),
            Kind::Gallery if self.rng.chance(0.15) => self.strike_find(id, &name),
            Kind::Dome if self.wild_slots.contains(&p.s) && self.wild_sealed() => {
                self.log("The Wild is sealed under glass. Now: the balance.");
            }
            _ => {}
        }

        self.effects.push(Effect::Built {
            x: p.s as f64 * SW + 20.0,
            y: mod_top(p.l) + 16.0,
        });
        let ending = if p.l == self.city_height() && p.l > 1 {
            " — a new high point!"
        } else if p.l == -self.city_depth() && p.l < -1 {
            " — deepest yet!"
        } else {
            "!"
        };
        let line = format!(
            "{name} finished the {} on {}{ending}",
            p.kind.lower_name(),
            lv_name(p.l)
        );
        if matches!(
            p.kind,
            Kind::Atrium | Kind::Lagoon | Kind::Beacon | Kind::Hall | Kind::Library | Kind::Dome
        ) {
            self.note(line);
        } else {
            self.log(line);
        }
    }

    /// The first two tenders without a home move in.
    fn house_homeless(&mut self, home: Home) {
        for a in self.agents.iter_mut().filter(|a| a.home.is_none()).take(2) {
            a.home = Some(home);
        }
    }

    /// Joins a new cable station to the nearest one still waiting for a partner.
    fn pair_cable(&mut self, id: RoomId) {
        let s = self.rooms[id].s;
        let other = (0..self.rooms.len())
            .filter(|&o| {
                o != id && self.rooms[o].kind == Kind::Cable && self.rooms[o].pair.is_none()
            })
            .min_by_key(|&o| (self.rooms[o].s - s).abs());
        let Some(other) = other else { return };
        self.rooms[id].pair = Some(other);
        self.rooms[other].pair = Some(id);
        self.compute_reach();
        let (a, b) = (&self.rooms[id], &self.rooms[other]);
        let line = format!(
            "A gondola line now runs from {} on tower {} to {} on tower {}.",
            lv_name(a.l),
            a.s - 1,
            lv_name(b.l),
            b.s - 1
        );
        self.note(line);
    }

    fn strike_find(&mut self, id: RoomId, name: &str) {
        let find = self
            .rng
            .pick(&[Find::Geode, Find::Spring, Find::Relic, Find::Fossil]);
        self.rooms[id].find = Some(find);
        let what = match find {
            Find::Geode => "a crystal geode. It hums, and it glows violet in the dark.",
            Find::Spring => "an underground spring. Cold water, endless.",
            Find::Relic => "an old-world machine, still half working. The workshop is thrilled.",
            Find::Fossil => "a fossil of something enormous. Everyone came down to look.",
        };
        self.note(format!("{name} broke through into {what}"));
        if find == Find::Fossil {
            for a in &mut self.agents {
                a.joy += 6.0;
            }
        }
    }
}
