use std::{
    collections::HashMap,
    io::Write,
    net::IpAddr,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::body::Bytes;
use flate2::{Compression, write::ZlibEncoder};
use tokio::sync::watch;

use super::sim::{STEP, World};

const MAX_VIEWERS: usize = 20;
const MAX_PER_ADDRESS: usize = 4;

/// Ticks between frames: five a second.
const FRAME_EVERY: u64 = 6;
/// Ticks between world updates when nothing was built: one every four seconds.
const WORLD_EVERY: u64 = 120;
/// A town is complete after about sixty days. It stands a while, then a new one begins.
const LAST_DAY: i32 = 100;
/// If the thread falls this far behind, the world slows down instead of racing to catch up.
const MAX_LAG: Duration = Duration::from_millis(500);

pub enum Refusal {
    Full,
    TooManyFromAddress,
}

#[derive(Default)]
struct Viewers {
    by_address: HashMap<IpAddr, usize>,
    total: usize,
}

/// Holds a viewer's place; dropping it gives the place back.
pub struct Ticket {
    address: IpAddr,
    shared: Arc<Shared>,
}

impl Drop for Ticket {
    fn drop(&mut self) {
        let mut viewers = self.shared.viewers.lock().unwrap();
        viewers.total -= 1;
        if let Some(n) = viewers.by_address.get_mut(&self.address) {
            *n -= 1;
            if *n == 0 {
                viewers.by_address.remove(&self.address);
            }
        }
    }
}

struct Shared {
    viewers: Mutex<Viewers>,
}

impl Shared {
    fn watching(&self) -> bool {
        self.viewers.lock().unwrap().total > 0
    }
}

pub struct Hub {
    world: watch::Receiver<Bytes>,
    frame: watch::Receiver<Bytes>,
    shared: Arc<Shared>,
    simulation: thread::Thread,
    closing: watch::Sender<bool>,
    origins: Vec<String>,
}

impl Hub {
    /// Starts the simulation on a thread of its own, so a slow tick never holds up a socket.
    pub fn start(origins: Vec<String>) -> Arc<Self> {
        let shared = Arc::new(Shared {
            viewers: Mutex::default(),
        });
        let mut simulation = Simulation::new();
        let (world_tx, world) = watch::channel(simulation.world_message());
        let (frame_tx, frame) = watch::channel(simulation.frame_message());

        let handle = thread::Builder::new()
            .name("terrarium".into())
            .spawn({
                let shared = shared.clone();
                move || simulation.run(&shared, &world_tx, &frame_tx)
            })
            .expect("spawn simulation thread");

        Arc::new(Self {
            world,
            frame,
            shared,
            simulation: handle.thread().clone(),
            closing: watch::Sender::new(false),
            origins,
        })
    }

    pub fn allows_origin(&self, origin: &str) -> bool {
        self.origins.iter().any(|o| o == origin)
    }

    pub fn admit(&self, address: IpAddr) -> Result<Ticket, Refusal> {
        let mut viewers = self.shared.viewers.lock().unwrap();
        if viewers.total >= MAX_VIEWERS {
            return Err(Refusal::Full);
        }
        let from_address = viewers.by_address.entry(address).or_default();
        if *from_address >= MAX_PER_ADDRESS {
            return Err(Refusal::TooManyFromAddress);
        }
        *from_address += 1;
        viewers.total += 1;
        drop(viewers);

        // The world stands still while nobody watches.
        self.simulation.unpark();
        Ok(Ticket {
            address,
            shared: self.shared.clone(),
        })
    }

    /// Asks every viewer's connection to end, so the server can stop.
    pub fn close(&self) {
        self.closing.send_replace(true);
    }

    pub fn closing(&self) -> watch::Receiver<bool> {
        self.closing.subscribe()
    }

    pub fn world(&self) -> watch::Receiver<Bytes> {
        self.world.clone()
    }

    pub fn frame(&self) -> watch::Receiver<Bytes> {
        self.frame.clone()
    }
}

struct Simulation {
    world: World,
    /// Identifies this world; viewers start afresh when it changes.
    run: u64,
    farewell_said: bool,
}

impl Simulation {
    fn new() -> Self {
        let run = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(1, |d| d.as_millis() as u64);
        Self {
            world: World::new(run),
            run,
            farewell_said: false,
        }
    }

    fn world_message(&self) -> Bytes {
        compress(&self.world.world_message(self.run, LAST_DAY))
    }

    fn frame_message(&mut self) -> Bytes {
        compress(&self.world.frame_message(self.run))
    }

    fn run(
        mut self,
        shared: &Shared,
        world_tx: &watch::Sender<Bytes>,
        frame_tx: &watch::Sender<Bytes>,
    ) {
        let step = Duration::from_secs_f64(STEP);
        let mut next = Instant::now();
        loop {
            if !shared.watching() {
                thread::park();
                next = Instant::now();
                continue;
            }

            self.world.tick(STEP);
            if self.world.day == LAST_DAY && !self.farewell_said {
                self.farewell_said = true;
                self.world.note(
                    "The tenders are packing. At dawn they walk on, to begin Sunhollow again somewhere new.",
                );
            }
            if self.world.day > LAST_DAY {
                self = Self::new();
            }

            if std::mem::take(&mut self.world.changed)
                || self.world.ticks.is_multiple_of(WORLD_EVERY)
            {
                world_tx.send_replace(self.world_message());
            }
            if self.world.ticks.is_multiple_of(FRAME_EVERY) {
                frame_tx.send_replace(self.frame_message());
            }

            next += step;
            let now = Instant::now();
            if next > now {
                thread::sleep(next - now);
            } else if now - next > MAX_LAG {
                next = now;
            }
        }
    }
}

/// Messages are JSON, compressed once for all viewers. Browsers undo this natively.
fn compress(json: &str) -> Bytes {
    let mut encoder = ZlibEncoder::new(Vec::with_capacity(json.len() / 4), Compression::default());
    encoder
        .write_all(json.as_bytes())
        .and_then(|()| encoder.finish())
        .expect("writing to memory cannot fail")
        .into()
}
