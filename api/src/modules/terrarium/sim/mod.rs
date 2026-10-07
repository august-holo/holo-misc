//! Sunhollow: a small town that builds itself. A port of the original
//! single-page simulation, with everything visual left to the browser.

mod agents;
mod council;
mod defs;
mod rng;
mod tick;
mod world;

mod snapshot;

pub use world::World;

/// Simulated seconds per step; the world is stepped thirty times a second.
pub const STEP: f64 = 1.0 / 30.0;

#[cfg(test)]
mod tests;
