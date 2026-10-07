use super::defs::*;
use super::{STEP, World};

const DAY: f64 = 180.0 - (60.0 - 50.0) * 0.8;

fn run_days(world: &mut World, days: i32) {
    while world.day <= days {
        world.tick(STEP);
    }
}

fn assert_sane(w: &World) {
    for (name, v) in [
        ("light", w.stock.light),
        ("leaf", w.stock.leaf),
        ("metal", w.stock.metal),
        ("water", w.stock.water),
    ] {
        assert!(v.is_finite() && v >= 0.0, "{name} is {v}");
    }
    assert!(w.stock.water <= w.water_cap);
    assert!(w.stock.light <= w.light_cap);
    for a in &w.agents {
        assert!(a.px.is_finite() && a.py.is_finite(), "{} is lost", a.name);
        assert!(
            (-5.0..=WW + 5.0).contains(&a.px),
            "{} at x {}",
            a.name,
            a.px
        );
        // Energy is only clamped between errands, so a long walk home dips well below zero.
        assert!(a.energy.is_finite() && a.energy <= 100.0);
    }
    for r in &w.rooms {
        assert!((0.0..=100.0).contains(&r.plants));
        assert!(r.animals.iter().all(|n| n.is_finite() && *n >= 0.0));
        assert_eq!(w.room_at(r.s, r.l).map(|x| x.kind), Some(r.kind));
    }
}

#[test]
fn same_seed_same_world() {
    let (mut a, mut b) = (World::new(7), World::new(7));
    run_days(&mut a, 3);
    run_days(&mut b, 3);
    assert_eq!(a.world_message(1, 100), b.world_message(1, 100));
    assert_eq!(a.frame_message(1), b.frame_message(1));
}

#[test]
fn a_town_grows() {
    for seed in 1..=4 {
        let mut w = World::new(seed);
        run_days(&mut w, 30);
        assert_sane(&w);
        assert!(
            w.find_kind(Kind::Hall).is_some(),
            "seed {seed}: no supper hall"
        );
        assert!(w.rooms.len() > 40, "seed {seed}: {} rooms", w.rooms.len());
        assert!(
            w.agents.len() > 8,
            "seed {seed}: {} tenders",
            w.agents.len()
        );
        assert!(
            w.city_height() >= 5,
            "seed {seed}: height {}",
            w.city_height()
        );
        assert!((w.sim_time / DAY - 30.0).abs() < 1.0);
    }
}

#[test]
fn messages_are_json() {
    let mut w = World::new(3);
    run_days(&mut w, 8);
    let world: serde_json::Value = serde_json::from_str(&w.world_message(9, 100)).unwrap();
    assert_eq!(world["type"], "world");
    assert_eq!(world["run"], 9);
    assert_eq!(world["rooms"].as_array().unwrap().len(), w.rooms.len());
    let frame: serde_json::Value = serde_json::from_str(&w.frame_message(9)).unwrap();
    assert_eq!(frame["type"], "frame");
    assert_eq!(frame["agents"].as_array().unwrap().len(), w.agents.len());
}

/// Prints how a town develops, for comparison with the original.
/// `cargo test --release growth_report -- --ignored --nocapture`
#[test]
#[ignore]
fn growth_report() {
    println!("seed day tenders rooms height depth wild  us/tick  world_bytes frame_bytes");
    for seed in 1..=5 {
        let mut w = World::new(seed);
        for day in [10, 20, 30, 40, 60] {
            let start = std::time::Instant::now();
            let ticks = w.ticks;
            run_days(&mut w, day);
            let per_tick = start.elapsed().as_micros() as f64 / (w.ticks - ticks) as f64;
            assert_sane(&w);
            println!(
                "{seed:4} {day:3} {:7} {:5} {:6} {:5} {:4} {per_tick:8.1} {:12} {:11}",
                w.agents.len(),
                w.rooms.len(),
                w.city_height(),
                w.city_depth(),
                w.wild_floors().len(),
                w.world_message(1, 100).len(),
                w.frame_message(1).len(),
            );
        }
    }
}

#[test]
#[ignore]
fn sample_messages() {
    let mut w = World::new(1);
    run_days(&mut w, 60);
    let frame = w.frame_message(1);
    let world = w.world_message(1, 100);
    println!("FRAME {}", &frame[..1500.min(frame.len())]);
    println!("WORLD {}", &world[..3000.min(world.len())]);
    let i = world.find("\"agents\"").unwrap();
    println!("AGENTS {}", &world[i..i + 900]);
}
