/// Small seeded generator (SplitMix64). The simulation needs reproducible worlds
/// from a seed, not cryptographic quality.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform in [a, b).
    pub fn range(&mut self, a: f64, b: f64) -> f64 {
        a + self.unit() * (b - a)
    }

    /// Uniform integer in [a, b].
    pub fn int(&mut self, a: i32, b: i32) -> i32 {
        self.range(a as f64, (b + 1) as f64).floor() as i32
    }

    pub fn chance(&mut self, p: f64) -> bool {
        self.unit() < p
    }

    pub fn index(&mut self, len: usize) -> usize {
        ((self.unit() * len as f64) as usize).min(len.saturating_sub(1))
    }

    pub fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.index(items.len())]
    }

    /// Weighted choice; returns the first item if every weight is zero.
    pub fn weighted<T: Copy>(&mut self, items: &[(T, f64)]) -> T {
        let total: f64 = items.iter().map(|(_, w)| w).sum();
        let mut r = self.unit() * total;
        for (item, w) in items {
            r -= w;
            if r <= 0.0 {
                return *item;
            }
        }
        items[0].0
    }
}
