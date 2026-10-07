use super::defs::*;
use super::world::*;

impl World {
    /// Advances the world by `dt` seconds.
    pub fn tick(&mut self, dt: f64) {
        self.sim_time += dt;
        self.ticks += 1;

        let day_len = 180.0 - (self.p.sun - 50.0) * 0.8;
        self.tod += dt / day_len;
        if self.tod >= 1.0 {
            self.tod -= 1.0;
            self.day += 1;
            self.supper_done = false;
            self.log(format!("Day {} in Sunhollow.", self.day));
        }
        self.supper_time(dt);

        self.weather(dt);
        let growth =
            dt * (0.02 + self.p.rain / 100.0 * 0.04 + if self.rain_now { 0.06 } else { 0.0 });

        self.water(dt);
        self.wild(dt, day_len);
        self.gardens(dt, growth);
        self.production(dt, growth);
        self.surprises(dt);

        self.plan_timer -= dt;
        if self.plan_timer <= 0.0 {
            self.plan_timer = self.rng.range(10.0, 20.0);
            self.plan();
        }
        self.fund_projects();
        self.arrivals(dt);

        for c in &mut self.cottages {
            c.age += dt;
        }
        if self.bell > 0.0 {
            self.bell -= dt;
        }
        for id in 0..self.agents.len() {
            self.update_agent(id, dt);
        }
    }

    fn supper_time(&mut self, dt: f64) {
        if !self.supper_done && self.tod > 0.73 {
            self.supper_done = true;
            self.supper = 55.0;
            let cook = self.rng.index(self.agents.len());
            let minnows = self
                .find_kind(Kind::Lagoon)
                .is_some_and(|l| self.rooms[l].n(Species::Minnow) > 4.0);
            let dish = if minnows && self.rng.chance(0.5) {
                "minnow stew"
            } else {
                self.rng.pick(&DISHES)
            };
            self.stock.leaf = (self.stock.leaf - 2.0).max(0.0);
            let place = if self.find_kind(Kind::Hall).is_some() {
                " in the hall"
            } else {
                ""
            };
            self.log(format!(
                "Supper{place}. {} put the pot on: {dish}.",
                self.agents[cook].name
            ));
            for id in 0..self.agents.len() {
                let a = &self.agents[id];
                if a.climbing == Climb::None && a.state != State::Build {
                    let timer = self.rng.range(0.0, 3.0);
                    let a = &mut self.agents[id];
                    a.state = State::Idle;
                    a.timer = timer;
                }
            }
        }
        if self.supper > 0.0 {
            self.supper -= dt;
        }
    }

    fn weather(&mut self, dt: f64) {
        self.rain_timer -= dt;
        if self.rain_timer <= 0.0 {
            if self.rain_now {
                self.rain_now = false;
                self.rain_timer = self.rng.range(8.0, 40.0) * (100.0 / (self.p.rain + 10.0));
                self.log("The rain thins to a drizzle.");
            } else if self.rng.chance(self.p.rain / 100.0) {
                self.rain_now = true;
                self.rain_timer = self.rng.range(40.0, 140.0) * (0.5 + self.p.rain / 100.0);
                self.wind = self.rng.range(-24.0, -6.0);
                self.log("Rain drums on the catchers.");
            } else {
                self.rain_timer = 12.0;
            }
        }
        if self.rain_now && self.rng.chance(0.0006) {
            self.flash = 1.0;
        }
        self.flash = (self.flash - dt * 3.0).max(0.0);
    }

    /// Rain comes in, and is shared between gardens, grove, turbines and the Wild.
    fn water(&mut self, dt: f64) {
        let p = &self.p;
        let mut inflow = 0.0;
        if self.rain_now {
            inflow += self.countf(Kind::Catcher) * 0.5;
            for s in CITY {
                let h = self.height_of(s);
                if h > 0 && self.kind_at(s, h) != Some(Kind::Catcher) {
                    inflow += 0.05;
                }
            }
            inflow += 0.2;
        }
        for _ in 0..self.count(Kind::Pump) {
            if self.stock.light > 0.5 {
                inflow += 0.08;
                self.stock.light -= dt * 0.02;
            }
        }
        self.stock.water = (self.stock.water + inflow * dt).min(self.water_cap);
        self.flow.inflow = inflow;

        let gardens = (self.count(Kind::Garden) + self.count(Kind::Dome)) as f64;
        let wild: f64 = self
            .rooms
            .iter()
            .map(|f| match f.kind {
                Kind::Grand => 0.02 * (f.w * f.h) as f64 / 2.0,
                Kind::Atrium => 0.05,
                Kind::Lagoon => 0.03,
                Kind::Wild => 0.02,
                _ => 0.0,
            })
            .sum();
        let demand = Flow {
            inflow: 0.0,
            gardens: gardens * 0.015 * (p.wgardens / 50.0),
            forest: 0.05 * (p.wforest / 50.0),
            turbine: self.countf(Kind::Turbine) * 0.08 * (p.wturbine / 50.0),
            wild: wild * (p.wwild / 50.0),
        };
        let total = demand.gardens + demand.forest + demand.turbine + demand.wild;
        let available = self.stock.water / dt;
        let share = if total > 0.0 {
            (available / total).min(1.0)
        } else {
            0.0
        };
        self.flow.gardens = demand.gardens * share;
        self.flow.forest = demand.forest * share;
        self.flow.turbine = demand.turbine * share;
        self.flow.wild = demand.wild * share;
        self.stock.water = (self.stock.water - total * share * dt).max(0.0);
    }

    /// The Wild: plants and creatures on every floor, moving through the tubes between them.
    fn wild(&mut self, dt: f64, day_len: f64) {
        use Species::*;
        let daylight = self.daylight();
        let floors = self.wild_floors();
        let feed = if floors.is_empty() {
            0.0
        } else {
            self.flow.wild / floors.len() as f64 / 0.02
        };
        let lagoon = self.find_kind(Kind::Lagoon);
        let mut in_balance = self.wild_sealed();
        let mut unbalanced = 0;

        for &id in &floors {
            let links = self.wild_links(id);
            if self.rooms[id].kind == Kind::Lagoon {
                let herons_near: f64 = links.iter().map(|&n| self.rooms[n].n(Heron)).sum();
                let overflow = self.tide(id, dt, feed, daylight, herons_near);
                self.stock.water = (self.stock.water + overflow).min(self.water_cap);
            } else {
                self.wild_floor(id, &links, floors.len(), dt, feed, daylight, lagoon);
            }
            let f = &mut self.rooms[id];
            f.harvested = (f.harvested - dt * 0.05).max(0.0);
            if f.status() != "balanced" {
                unbalanced += 1;
            }
        }

        if unbalanced > (floors.len() as f64 * 0.15).floor() as i32 || self.species_alive() < 3 {
            in_balance = false;
        }
        if in_balance {
            self.balance_t += dt;
        } else {
            self.balance_t = (self.balance_t - dt * 0.35).max(0.0);
        }
        self.wild_days = self.balance_t / day_len;
        if !self.wild_achieved && self.wild_days >= 3.0 {
            self.wild_achieved = true;
            self.note(
                "The Wild holds. Three days in balance — Sunhollow has made a wilderness that keeps itself.",
            );
            self.effects.push(Effect::WildHolds);
            self.effects.push(Effect::Celebrate);
        }
    }

    /// The tide atrium. Returns water spilled back to the cisterns.
    fn tide(&mut self, id: RoomId, dt: f64, feed: f64, daylight: f64, herons_near: f64) -> f64 {
        use Species::*;
        let f = &mut self.rooms[id];
        let mut overflow = 0.0;
        if f.level < 0.5 && feed > 0.0 {
            f.level = (f.level + feed * 0.002 * dt).min(1.0);
        }
        if f.level > 0.98 {
            overflow = 0.2 * dt;
            f.level = 0.98;
        }
        let depth = 0.15 + 0.85 * f.level;
        let light = 0.5 + 0.5 * daylight;
        let (minnow, pike, crab) = (f.n(Minnow), f.n(Pike), f.n(Crab));

        f.plants += dt
            * (0.4 * (1.0 - f.plants / 100.0) * light * depth * (0.7 + 0.5 * f.fert)
                - 0.02 * minnow
                - 0.03 * crab);
        f.plants = f.plants.clamp(0.0, 100.0);
        f.fert = (f.fert + dt * (0.01 * crab - 0.003)).clamp(0.0, 1.0);

        let stress = if f.level < 0.4 { 0.01 } else { 0.0 };
        let kelp = f.plants / 100.0;
        let mut d_minnow = minnow * (0.03 * kelp * depth * (1.0 - minnow / 14.0) - 0.01 - stress)
            - 0.04 * pike * minnow / (minnow + 3.0)
            - 0.015 * herons_near * minnow / (minnow + 4.0);
        if f.plants > 40.0 && minnow < 1.0 && f.level > 0.4 {
            d_minnow += 0.006;
        }
        let mut d_pike =
            pike * (0.015 * minnow / (minnow + 5.0) * (1.0 - pike / 3.0) - 0.007 - stress);
        if minnow > 4.5 && pike < 0.5 {
            d_pike += 0.004;
        }
        let mut d_crab = crab * (0.012 * kelp * (1.0 - crab / 6.0) - 0.006 - stress);
        if f.plants > 40.0 && crab < 0.5 {
            d_crab += 0.004;
        }
        *f.n_mut(Minnow) = (minnow + d_minnow * dt).clamp(0.0, 16.0);
        *f.n_mut(Pike) = (pike + d_pike * dt).clamp(0.0, 4.0);
        *f.n_mut(Crab) = (crab + d_crab * dt).clamp(0.0, 7.0);
        overflow
    }

    #[allow(clippy::too_many_arguments)]
    fn wild_floor(
        &mut self,
        id: RoomId,
        links: &[RoomId],
        floor_count: usize,
        dt: f64,
        feed: f64,
        daylight: f64,
        lagoon: Option<RoomId>,
    ) {
        use Species::*;
        let kind = self.rooms[id].kind;
        let big = matches!(kind, Kind::Atrium | Kind::Grand);
        let marsh = kind == Kind::Marsh;
        let k = self.rooms[id].scale();

        if marsh {
            let rain = if self.rain_now {
                0.006 * (self.p.rain / 60.0)
            } else {
                0.0
            };
            let f = &mut self.rooms[id];
            f.level = (f.level + rain * dt - 0.0007 * dt).clamp(0.0, 1.2);
            f.channel = false;
            let mut to_cistern = 0.0;
            if f.level > 0.6 {
                // The channel drains the marsh into the tide atrium, or the cisterns once that is full.
                let q = 0.004 * dt;
                f.level -= q;
                match lagoon {
                    Some(lg) if self.rooms[lg].level < 0.98 => {
                        self.rooms[lg].level += q / 3.0;
                        self.rooms[id].channel = true;
                    }
                    _ => to_cistern += q * 8.0,
                }
            }
            let f = &mut self.rooms[id];
            if f.level > 1.0 {
                to_cistern += (f.level - 1.0) * 8.0;
                f.level = 1.0;
            }
            f.water = (0.2 + f.level).min(1.0);
            self.stock.water = (self.stock.water + to_cistern).min(self.water_cap);
        } else {
            let f = &mut self.rooms[id];
            let gain = feed * 0.02 * dt * if big { 1.6 } else { 1.0 };
            f.water = (f.water + gain - dt * 0.005).clamp(0.0, 1.0);
        }

        let f = &mut self.rooms[id];
        let light = 0.45 + 0.55 * daylight;
        let wet = if marsh {
            0.2 + 0.8 * f.level.min(1.0)
        } else {
            0.25 + 0.75 * f.water
        };
        if big {
            let rate = if kind == Kind::Grand {
                0.00028
            } else {
                0.00035
            };
            let grow = dt * rate * (0.4 + f.water) * if f.plants > 15.0 { 1.0 } else { 0.4 };
            for c in &mut f.cedars {
                c.h = (c.h + grow * (0.7 + c.seed * 0.6)).min(1.0);
            }
            f.canopy = f.cedars.iter().map(|c| c.h).sum::<f64>() / f.cedars.len() as f64;
        }

        let (moth, frog, finch, heron, goat) =
            (f.n(Moth), f.n(Frog), f.n(Finch), f.n(Heron), f.n(Goat));
        let canopy = if big { f.canopy } else { 0.0 };
        let growth = 0.5
            * (1.0 - f.plants / 100.0)
            * light
            * wet
            * (0.7 + 0.6 * f.fert)
            * (1.0 + 0.04 * moth.min(6.0))
            * if big { 1.0 + 0.4 * canopy } else { 1.0 };
        f.plants += dt * (growth - 0.025 * finch - 0.12 * goat - 0.005 * moth);
        let (plants, water) = (f.plants, f.water);

        // Finches carry seed through the tubes to barer floors.
        if finch > 0.0 {
            for &n in links {
                if self.rooms[n].plants < 40.0 {
                    self.rooms[n].plants += dt * 0.02 * finch;
                }
            }
        }
        let f = &mut self.rooms[id];
        f.plants = plants.clamp(0.0, 100.0);
        let plants = f.plants;
        f.fert = (f.fert + dt * (0.012 * goat + 0.002 * finch - 0.004)).clamp(0.0, 1.0);

        let nectar = if plants > 55.0 {
            1.0
        } else {
            plants / 55.0 * 0.5
        };
        let mut d_moth = moth * (0.03 * nectar * (1.0 - moth / (8.0 * k)) - 0.012)
            - 0.03 * frog * moth / (moth + 2.0);
        if plants > 60.0 && moth < 1.0 {
            d_moth += 0.008;
        }
        let frog_room = 5.0 * k * if marsh { 2.0 } else { 1.0 };
        let mut d_frog = frog
            * (0.026 * moth / (moth + 3.0) * wet * (1.0 - frog / frog_room) - 0.009)
            - 0.03 * heron * frog / (frog + 2.0);
        if moth > 3.0 && water > 0.5 && frog < 1.0 {
            d_frog += if marsh { 0.012 } else { 0.005 };
        }
        let finch_room = 4.0 * k * if big { 1.0 + canopy } else { 1.0 };
        let mut d_finch = finch * (0.014 * (plants / 100.0) * (1.0 - finch / finch_room) - 0.007);
        if plants > 50.0 && finch < 1.0 && floor_count >= 2 {
            d_finch += 0.004 * if big { 3.0 } else { 1.0 };
        }
        let (s, l) = (f.s, f.l);
        let top_floor = !self
            .rooms
            .iter()
            .any(|o| o.kind.is_wild() && o.s == s && o.l > l);
        let mut d_heron = heron * (0.012 * frog / (frog + 3.0) * (1.0 - heron / (1.5 * k)) - 0.006);
        let roost = (top_floor && frog > 1.5) || (big && canopy > 0.4 && frog > 0.8);
        if roost && floor_count >= 4 && heron < 0.5 {
            d_heron += 0.004;
        }
        let mut d_goat = if marsh {
            -0.02 * goat
        } else {
            goat * (0.004 * (plants / 100.0) - 0.003)
        };
        if plants < 20.0 {
            d_goat -= 0.01 * goat;
        }
        // Goats wander off a grazed-out floor on their own, slowly.
        if plants < 30.0
            && goat >= 1.0
            && let Some(&to) = links.iter().find(|&&n| self.rooms[n].plants > 50.0)
        {
            *self.rooms[id].n_mut(Goat) -= dt * 0.01;
            *self.rooms[to].n_mut(Goat) += dt * 0.01;
        }

        let f = &mut self.rooms[id];
        let goat = f.n(Goat);
        *f.n_mut(Moth) = (moth + d_moth * dt).clamp(0.0, 12.0 * k);
        *f.n_mut(Frog) = (frog + d_frog * dt).clamp(0.0, 8.0 * k);
        *f.n_mut(Finch) = (finch + d_finch * dt).clamp(0.0, 8.0 * k);
        *f.n_mut(Heron) = (heron + d_heron * dt).clamp(0.0, 3.0 * k);
        *f.n_mut(Goat) = (goat + d_goat * dt).clamp(0.0, 5.0 * k);

        // Flying and hopping creatures even out between linked floors.
        for &n in links {
            if self.rooms[n].kind == Kind::Lagoon {
                continue;
            }
            for (sp, rate) in [(Moth, 0.03), (Finch, 0.025), (Frog, 0.008), (Heron, 0.02)] {
                let d = (self.rooms[id].n(sp) - self.rooms[n].n(sp)) * rate * dt * 0.5;
                *self.rooms[id].n_mut(sp) -= d;
                *self.rooms[n].n_mut(sp) += d;
            }
        }

        let f = &self.rooms[id];
        if !marsh
            && f.plants > 68.0
            && f.n(Goat) < 0.5
            && self.goats_introduced < (floor_count as f64 / 2.0).ceil() as i32
            && self.rng.chance(dt * 0.02)
        {
            *self.rooms[id].n_mut(Goat) += 1.0;
            self.goats_introduced += 1;
            self.log(format!(
                "A moss-goat is let into the Wild on {} to keep the growth down.",
                lv_name(l)
            ));
        }
    }

    fn gardens(&mut self, dt: f64, growth: f64) {
        let count = (self.count(Kind::Garden) + self.count(Kind::Dome)) as f64;
        let feed = if count > 0.0 {
            self.flow.gardens / count / 0.015
        } else {
            0.0
        };
        let rain = self.rain_now;
        for b in &mut self.rooms {
            let dome = b.kind == Kind::Dome;
            if b.kind != Kind::Garden && !dome {
                continue;
            }
            b.water = (b.water + feed * 0.02 * dt).min(1.0) - dt * 0.006;
            if rain && dome {
                b.water = 1.0;
            }
            b.water = b.water.max(0.0);
            if b.water > 0.05 && b.amt < if dome { 5 } else { 4 } {
                b.grow += growth * 1.4 * (0.5 + b.water);
                if b.grow > 1.0 {
                    b.grow = 0.0;
                    b.amt += 1;
                }
            }
        }
        let rain = if rain { 0.01 } else { 0.0 };
        self.forest_health = (self.forest_health
            + (self.flow.forest / 0.05 * 0.006 + rain - 0.004) * dt)
            .clamp(0.05, 1.0);
        self.stock.light += self.flow.turbine * dt;
    }

    fn production(&mut self, dt: f64, growth: f64) {
        use Species::*;
        let daylight = self.daylight();
        let sun = self.p.sun / 60.0;
        self.stock.light += dt * 0.045 * daylight * sun;
        self.light_cap = 30.0 + 40.0 * self.countf(Kind::Battery);

        let apiary_columns: Vec<i32> = self
            .rooms
            .iter()
            .filter(|b| b.kind == Kind::Apiary)
            .map(|b| b.s)
            .collect();
        let mut releases = 0;
        for b in &mut self.rooms {
            b.age += dt;
            let height = b.l as f64;
            match b.kind {
                Kind::Solar => {
                    self.stock.light += dt * 0.08 * daylight * sun * (1.0 + height * 0.08)
                }
                Kind::Wind => {
                    self.stock.light += dt * 0.04 * (1.3 - daylight) * (0.5 + height * 0.12)
                }
                Kind::Geo => self.stock.light += dt * 0.1,
                Kind::Apiary => self.stock.leaf += dt * 0.01,
                Kind::Mistnet => {
                    self.stock.water = (self.stock.water + dt * 0.06).min(self.water_cap)
                }
                Kind::Foundry if self.stock.light > 0.5 => self.stock.light -= dt * 0.02,
                Kind::Aviary => {
                    b.grow += dt;
                    if b.grow > 120.0 {
                        b.grow = 0.0;
                        releases += 1;
                    }
                }
                Kind::Garden if apiary_columns.contains(&b.s) => b.grow += growth * 0.5,
                Kind::Workshop => self.stock.metal += dt * 0.02,
                Kind::Market => self.stock.leaf += dt * 0.006,
                Kind::Cave if b.amt < 4 => {
                    b.grow += dt * 0.03;
                    if b.grow > 1.0 {
                        b.grow = 0.0;
                        b.amt += 1;
                    }
                }
                _ => {}
            }
            match b.find {
                Some(Find::Geode) => self.stock.light += dt * 0.05,
                Some(Find::Spring) => {
                    self.stock.water = (self.stock.water + dt * 0.05).min(self.water_cap)
                }
                _ => {}
            }
        }

        for _ in 0..releases {
            let floors: Vec<RoomId> = self
                .wild_floors()
                .into_iter()
                .filter(|&f| self.rooms[f].kind != Kind::Lagoon)
                .collect();
            if floors.is_empty() {
                continue;
            }
            let f = self.rng.pick(&floors);
            if self.rng.chance(0.7) {
                *self.rooms[f].n_mut(Finch) += 1.0;
                self.log("The aviary let a finch loose into the Wild.");
            } else {
                *self.rooms[f].n_mut(Heron) += 0.6;
                self.log("The aviary released a young heron into the Wild.");
            }
        }

        for st in &mut self.street {
            if st.sub == StreetKind::Rubble && st.amt < 8 {
                st.grow += dt * 0.015;
                if st.grow > 1.0 {
                    st.grow = 0.0;
                    st.amt += 1;
                }
            }
        }
        let tree_growth = growth * (0.3 + self.forest_health);
        for t in &mut self.trees {
            if t.size < 3 {
                t.grow += tree_growth * 0.6;
                if t.grow > 1.0 {
                    t.grow = 0.0;
                    t.size += 1;
                }
            } else if t.amt < 3 {
                t.grow += tree_growth;
                if t.grow > 1.0 {
                    t.grow = 0.0;
                    t.amt += 1;
                }
            }
        }
    }

    fn surprises(&mut self, dt: f64) {
        let daylight = self.daylight();
        self.airship(dt);

        if self.day % 5 == 0 && !self.festival_done && self.tod > 0.82 && self.supper <= 0.0 {
            self.festival_done = true;
            self.festival = 80.0;
            self.note("Lantern night. Everyone goes up to let the lanterns go.");
            self.effects.push(Effect::Celebrate);
        }
        if self.day % 5 != 0 {
            self.festival_done = false;
        }
        if self.festival > 0.0 {
            self.festival -= dt;
        }
        if self.tod < 0.01 && self.ticks.is_multiple_of(30) {
            self.kite_day = !self.rain_now && self.rng.chance(0.35);
        }

        if self.rain_now
            && self.storm <= 0.0
            && self.day >= self.ship.storm_day
            && self.rng.chance(dt * 0.0012)
        {
            self.storm = 70.0;
            self.blackout = 7.0;
            self.ship.storm_day = self.day + 2;
            self.note("A storm off the old towers. The lights went out for a while.");
            for id in 0..self.agents.len() {
                let a = &mut self.agents[id];
                if a.l == 0 && a.climbing == Climb::None {
                    a.startled = 1.5;
                    a.carry = None;
                    self.think(id, super::agents::Errand::Startled);
                }
            }
        }
        if self.storm > 0.0 {
            self.storm -= dt;
            if self.rng.chance(dt * 0.12) {
                self.flash = 1.0;
            }
        }
        if self.blackout > 0.0 {
            self.blackout -= dt;
        }

        if self.birds.is_none()
            && self.tod > 0.26
            && self.tod < 0.3
            && self.day % 2 == 0
            && self.rng.chance(dt * 0.3)
        {
            self.birds = Some(Birds {
                x: -40.0,
                y: SY - 420.0 + self.rng.range(-60.0, 60.0),
                t: 0.0,
            });
        }
        if let Some(b) = &mut self.birds {
            b.x += dt * 40.0;
            b.t += dt;
            if b.x > WW + 60.0 {
                self.birds = None;
            }
        }

        if daylight < 0.2 && !self.rain_now && self.rng.chance(dt * 0.12) {
            self.shooters.push(Shooter {
                x: self.rng.range(0.0, WW),
                y: self.rng.range(20.0, SY * 0.4),
                vx: self.rng.range(-160.0, -60.0),
                vy: self.rng.range(40.0, 90.0),
                life: 0.7,
            });
        }
        for s in &mut self.shooters {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt;
        }
        self.shooters.retain(|s| s.life > 0.0);

        self.cat_and_fox(dt, daylight);

        if self.stock.light > self.light_cap {
            self.spill = ((self.stock.light - self.light_cap) * 0.5).min(1.0);
            self.stock.light = self.light_cap;
        } else {
            self.spill = (self.spill - dt * 0.3).max(0.0);
        }

        if self.count(Kind::Loom) > 0 {
            self.scarf_t -= dt;
            if self.scarf_t <= 0.0 {
                self.scarf_t = self.rng.range(150.0, 300.0);
                let bare: Vec<AgentId> = (0..self.agents.len())
                    .filter(|&a| self.agents[a].scarf.is_none())
                    .collect();
                if !bare.is_empty() {
                    let id = self.rng.pick(&bare);
                    let scarf = self.rng.pick(&SCARVES);
                    let a = &mut self.agents[id];
                    a.scarf = Some(scarf);
                    a.joy += 8.0;
                    if self.agents.iter().filter(|a| a.scarf.is_some()).count() == 1 {
                        self.note(format!(
                            "{} came out of the weaver's loft in a new scarf. Others will want one.",
                            self.agents[id].name
                        ));
                    }
                }
            }
        }

        if self.count(Kind::Belltower) > 0
            && self.day % 3 == 0
            && self.tod > 0.27
            && self.tod < 0.29
            && self.bell <= 0.0
            && !self.ship.rang
        {
            self.ship.rang = true;
            self.bell = 22.0;
            self.log("The bell tower rings. A morning gathering at the hub.");
        }
        if self.tod > 0.5 {
            self.ship.rang = false;
        }

        if self.count(Kind::Observatory) > 0 && daylight < 0.2 && !self.rain_now {
            self.comet_t += dt;
            if self.comet_t > 500.0 && self.rng.chance(dt * 0.02) {
                self.comet_t = 0.0;
                self.note("The observatory spotted a comet. The whole town went up to see it.");
                for a in &mut self.agents {
                    a.joy += 10.0;
                }
                self.shooters.push(Shooter {
                    x: self.rng.range(0.0, WW),
                    y: 60.0,
                    vx: -20.0,
                    vy: 8.0,
                    life: 9.0,
                });
            }
        }
    }

    fn airship(&mut self, dt: f64) {
        let pier = self.find_kind(Kind::Pier);
        if !self.ship.active && self.day >= self.ship.next_day && self.tod > 0.3 && self.tod < 0.35
        {
            let (tx, y) = match pier {
                Some(p) => (center(self.rooms[p].s), mod_top(self.rooms[p].l) - 34.0),
                None => {
                    let tallest = CITY.fold(CITY.start, |best, s| {
                        if self.height_of(s) > self.height_of(best) {
                            s
                        } else {
                            best
                        }
                    });
                    (center(tallest), mod_top(self.city_height().max(1)) - 46.0)
                }
            };
            self.ship = Ship {
                active: true,
                phase: 0,
                x: -80.0,
                tx,
                y,
                gifts: if pier.is_some() { 2 } else { 1 },
                ..std::mem::take(&mut self.ship)
            };
            self.note("An airship is coming in over the old towers.");
        }
        if !self.ship.active {
            return;
        }

        match self.ship.phase {
            0 => {
                self.ship.x += dt * 18.0;
                if self.ship.x >= self.ship.tx {
                    self.ship.x = self.ship.tx;
                    self.ship.phase = 1;
                    self.ship.timer = 60.0;
                    for _ in 0..self.ship.gifts.max(1) {
                        self.airship_gift();
                    }
                }
            }
            1 => {
                self.ship.timer -= dt;
                self.ship.y += (self.sim_time * 0.7).sin() * 0.05;
                if self.ship.timer <= 0.0 {
                    self.ship.phase = 2;
                }
            }
            _ => {
                self.ship.x += dt * 22.0;
                self.ship.y -= dt * 4.0;
                if self.ship.x > WW + 90.0 {
                    self.ship.active = false;
                }
                self.ship.next_day = self.day
                    + if pier.is_some() {
                        2
                    } else {
                        self.rng.int(3, 6)
                    };
            }
        }
    }

    fn airship_gift(&mut self) {
        let r = self.rng.unit();
        let lagoon = self.find_kind(Kind::Lagoon);
        if r < 0.25 && self.stock.leaf >= 10.0 {
            self.stock.leaf -= 10.0;
            self.stock.metal += 7.0;
            self.note("The airship traded seven crates of metal for our greens.");
        } else if r < 0.45 {
            let homes: Vec<RoomId> = (0..self.rooms.len())
                .filter(|&b| self.rooms[b].kind == Kind::Home && !self.rooms[b].glowvine)
                .collect();
            if homes.is_empty() {
                self.stock.leaf += 6.0;
                self.note("The trader left a sack of strange seeds.");
            } else {
                let home = self.rng.pick(&homes);
                self.rooms[home].glowvine = true;
                self.changed = true;
                self.note("The trader left a glow-vine cutting. It has taken to a pod home.");
            }
        } else if let Some(lg) = lagoon
            && r < 0.6
        {
            *self.rooms[lg].n_mut(Species::Minnow) += 4.0;
            self.note("The trader tipped a bucket of minnows into the tide atrium.");
        } else if r < 0.8 {
            self.stock.metal += 8.0;
            self.note("A crate of metal came down on a rope. No charge.");
        } else {
            let id = self.spawn_agent(true);
            let tx = self.ship.tx;
            let a = &mut self.agents[id];
            a.s = slot_of(tx);
            a.px = tx;
            a.l = 0;
            a.py = feet_y(0);
            self.changed = true;
            self.note(format!(
                "{} climbed down the airship ladder and decided to stay.",
                self.agents[id].name
            ));
        }
    }

    /// A cat on the hall roof, a fox in the grove at night.
    fn cat_and_fox(&mut self, dt: f64, daylight: f64) {
        if let Some(hall) = self.find_kind(Kind::Hall) {
            let roof = mod_top(self.rooms[hall].l) - 4.0;
            self.cat.t -= dt;
            if self.cat.t <= 0.0 {
                self.cat.t = self.rng.range(6.0, 18.0);
                self.cat.state = self.rng.pick(&[
                    CatState::Sit,
                    CatState::Walk,
                    CatState::Sleep,
                    CatState::Stretch,
                ]);
                self.cat.dir = if self.rng.chance(0.5) { 1.0 } else { -1.0 };
            }
            let cat = &mut self.cat;
            if cat.state == CatState::Walk {
                cat.x += cat.dir * dt * 8.0;
                if cat.x < 4.0 || cat.x > 60.0 {
                    cat.dir *= -1.0;
                    cat.x = cat.x.clamp(4.0, 60.0);
                }
            }
            if cat.state == CatState::Sleep && self.rng.chance(dt * 0.5) {
                cat.x = 66.0;
            }
            cat.y = roof;
        }

        self.fox.t -= dt;
        if self.fox.t <= 0.0 {
            self.fox.t = self.rng.range(4.0, 12.0);
            self.fox.dir = if self.rng.chance(0.5) { 1.0 } else { -1.0 };
        }
        if daylight < 0.3 && self.supper <= 0.0 {
            self.fox.x += self.fox.dir * dt * 14.0;
            if self.fox.x < 6.0 || self.fox.x > 72.0 {
                self.fox.dir *= -1.0;
            }
        }
    }

    /// Travellers walk in when the town is happy and has room.
    fn arrivals(&mut self, dt: f64) {
        self.arrival_timer -= dt;
        if self.arrival_timer > 0.0 {
            return;
        }
        let pull =
            self.countf(Kind::Beacon) + self.countf(Kind::Library) + self.countf(Kind::Dome) * 0.5;
        self.arrival_timer = self.rng.range(60.0, 110.0) / (1.0 + pull * 0.4);
        let average_joy = self.agents.iter().map(|a| a.joy).sum::<f64>() / self.agents.len() as f64;
        if self.agents.len() >= self.capacity() || average_joy <= 40.0 {
            return;
        }

        let id = self.spawn_agent(true);
        let home = (0..self.rooms.len())
            .filter(|&b| self.rooms[b].kind == Kind::Home)
            .map(Home::Room)
            .chain((0..self.cottages.len()).map(Home::Cottage))
            .find(|&h| self.residents(h) < 2);
        self.agents[id].home = home;
        self.changed = true;
        let road = if self.agents[id].s == 0 {
            "grove road"
        } else {
            "east road"
        };
        self.note(format!(
            "{} walked in from the {road}, following the glow.",
            self.agents[id].name
        ));
    }
}
