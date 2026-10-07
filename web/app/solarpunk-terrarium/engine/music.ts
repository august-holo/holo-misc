// The procedural lo-fi record from the original page, unchanged in how it plays.
// It follows the town's mood: brighter by day, more crackle in the rain.

export interface Mood {
  daylight: number;
  raining: boolean;
}

export function createMusic(mood: () => Mood) {
  let ac: AudioContext,
    master: GainNode,
    lp: BiquadFilterNode,
    comp: DynamicsCompressorNode,
    crackleGain: GainNode,
    delay: DelayNode,
    delayFb: GainNode,
    delayLp: BiquadFilterNode,
    crush: WaveShaperNode,
    padGain: GainNode,
    bassGain: GainNode,
    melGain: GainNode,
    drumGain: GainNode,
    pulseWave: PeriodicWave,
    timer: ReturnType<typeof setInterval> | null = null,
    started = false,
    playing = false,
    volume = 60;
  let step = 0,
    nextT = 0,
    chordIdx = 0,
    melIdx = 7,
    melHold = 0,
    prog = 0;
  const BPM = 74,
    SPB = 60 / BPM,
    STEP = SPB / 4,
    SWING = 0.13;
  const A = 55;
  const midi = (n: number) => A * Math.pow(2, (n - 33) / 12); // A1=33
  // A minor/dorian world. chords as semitone offsets from A (midi 45 = A2)
  const PROGS = [
    [
      [0, 3, 7, 10],
      [8, 12, 15, 19],
      [3, 7, 10, 14],
      [10, 14, 17, 21],
    ], // Am7 Fmaj7 Cmaj7 G6
    [
      [0, 3, 7, 14],
      [5, 8, 12, 15],
      [7, 10, 14, 17],
      [8, 12, 15, 19],
    ], // Am9 Dm7 Em7 Fmaj7
    [
      [0, 3, 7, 10],
      [3, 7, 10, 14],
      [5, 8, 12, 15],
      [7, 10, 14, 15],
    ],
  ]; // Am7 Cmaj7 Dm7 Em7(b6)
  const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24]; // A dorian-ish, two octaves
  function init() {
    ac = new AudioContext();
    started = true;
    master = ac.createGain();
    master.gain.value = 0.6;
    lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;
    lp.Q.value = 0.4;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    lp.connect(comp);
    comp.connect(master);
    master.connect(ac.destination);
    // buses
    padGain = ac.createGain();
    padGain.gain.value = 0.16;
    padGain.connect(lp);
    bassGain = ac.createGain();
    bassGain.gain.value = 0.3;
    bassGain.connect(lp);
    drumGain = ac.createGain();
    drumGain.gain.value = 0.35;
    const dlp = ac.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2600;
    drumGain.connect(dlp);
    dlp.connect(lp);
    // melody: pulse -> crusher -> delay
    const n = 64,
      re = new Float32Array(n),
      im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    }
    pulseWave = ac.createPeriodicWave(re, im);
    crush = ac.createWaveShaper();
    const cv = new Float32Array(1024),
      stepsQ = 24;
    for (let i = 0; i < 1024; i++) {
      const x = i / 511.5 - 1;
      cv[i] = Math.round(x * stepsQ) / stepsQ;
    }
    crush.curve = cv;
    melGain = ac.createGain();
    melGain.gain.value = 0.22;
    delay = ac.createDelay(2);
    delay.delayTime.value = STEP * 3;
    delayFb = ac.createGain();
    delayFb.gain.value = 0.38;
    delayLp = ac.createBiquadFilter();
    delayLp.type = "lowpass";
    delayLp.frequency.value = 1800;
    melGain.connect(crush);
    crush.connect(lp);
    crush.connect(delay);
    delay.connect(delayLp);
    delayLp.connect(delayFb);
    delayFb.connect(delay);
    delayLp.connect(lp);
    // vinyl crackle: filtered noise + clicks
    const bufLen = ac.sampleRate * 2,
      buf = ac.createBuffer(1, bufLen, ac.sampleRate),
      d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.98 * b0 + 0.02 * w;
      d[i] = b0 * 0.6 + (Math.random() < 0.0012 ? (Math.random() * 2 - 1) * 1.5 : 0);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    crackleGain = ac.createGain();
    crackleGain.gain.value = 0.05;
    src.connect(hp);
    hp.connect(crackleGain);
    crackleGain.connect(master);
    src.start();
  }
  function env(
    g: GainNode,
    t: number,
    a: number,
    d: number,
    sus: number,
    rel: number,
    peak: number,
  ) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    g.gain.setTargetAtTime(0.0001, t + a + d, rel);
  }
  function osc(
    type: OscillatorType | "pulse",
    freq: number,
    t: number,
    dur: number,
    dest: AudioNode,
    peak: number,
    a = 0.01,
    detune = 0,
  ) {
    const o = ac.createOscillator();
    if (type === "pulse") o.setPeriodicWave(pulseWave);
    else o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ac.createGain();
    o.connect(g);
    g.connect(dest);
    env(g, t, a, dur * 0.6, 0.5, 0.25, peak);
    o.start(t);
    o.stop(t + dur + 1.2);
  }
  function chord(t: number, notes: number[], dur: number) {
    for (const n of notes) {
      const f = midi(45 + n);
      osc("triangle", f, t, dur, padGain, 0.5, 0.6, -6);
      osc("sawtooth", f / 2, t, dur, padGain, 0.12, 0.9, 7);
      osc("triangle", f, t, dur, padGain, 0.35, 0.7, 6);
    }
  }
  function bass(t: number, n: number, dur: number) {
    osc("triangle", midi(33 + n), t, dur, bassGain, 0.9, 0.02);
    osc("sine", midi(33 + n), t, dur, bassGain, 0.5, 0.02);
  }
  function mel(t: number, n: number, dur: number, vel: number) {
    osc("pulse", midi(57 + n), t, dur, melGain, vel, 0.005);
  }
  function kick(t: number) {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g);
    g.connect(drumGain);
    o.start(t);
    o.stop(t + 0.3);
  }
  function noise(t: number, dur: number, peak: number, hpf: number, q: number) {
    const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = b;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = hpf;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(drumGain);
    s.start(t);
  }
  const snare = (t: number) => {
    noise(t, 0.14, 0.5, 1800, 0.8);
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.frequency.value = 190;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g);
    g.connect(drumGain);
    o.start(t);
    o.stop(t + 0.1);
  };
  const hat = (t: number, v: number) => noise(t, 0.04, v, 7000, 1.5);
  function schedule() {
    const { daylight: dl, raining } = mood();
    while (nextT < ac.currentTime + 0.15) {
      const t = nextT + (step % 2 ? STEP * SWING : 0),
        bar = Math.floor(step / 16),
        s16 = step % 16;
      if (s16 === 0) {
        if (bar % 2 === 0) {
          chordIdx = (chordIdx + 1) % 4;
          if (chordIdx === 0 && Math.random() < 0.5) prog = (prog + 1) % PROGS.length;
          chord(t, PROGS[prog][chordIdx], SPB * 8);
        }
      }
      const ch = PROGS[prog][chordIdx],
        root = ch[0];
      if (
        s16 === 0 ||
        s16 === 6 ||
        (s16 === 10 && Math.random() < 0.5) ||
        (s16 === 14 && Math.random() < 0.25)
      )
        bass(t, root + (s16 === 14 ? 7 : 0), s16 === 0 ? SPB * 1.4 : SPB * 0.6);
      // melody: sparse random walk, prefers chord tones on beats
      if (melHold > 0) melHold--;
      else if (Math.random() < (s16 % 4 === 0 ? 0.5 : 0.22) && bar % 8 !== 7) {
        const move = Math.random();
        melIdx +=
          move < 0.15
            ? 0
            : move < 0.55
              ? Math.random() < 0.5
                ? 1
                : -1
              : (Math.random() < 0.5 ? 2 : -2) * (Math.random() < 0.5 ? 1 : -1);
        melIdx = Math.max(2, Math.min(SCALE.length - 1, melIdx));
        let n = SCALE[melIdx];
        if (s16 % 4 === 0 && Math.random() < 0.6) {
          let best = n,
            bd = 99;
          for (const c of ch) {
            for (const o of [-12, 0, 12]) {
              const d = Math.abs(c + o - n);
              if (d < bd) {
                bd = d;
                best = c + o;
              }
            }
          }
          n = best;
          melIdx =
            SCALE.indexOf(((n % 24) + 24) % 24) >= 0 ? SCALE.indexOf(((n % 24) + 24) % 24) : melIdx;
        }
        const len = Math.random() < 0.3 ? 4 : Math.random() < 0.6 ? 2 : 1;
        mel(t, n, STEP * len * 1.4, 0.5 + Math.random() * 0.35);
        melHold = len - 1 + (Math.random() < 0.25 ? 2 : 0);
      }
      // drums, lo-fi and lazy
      if (s16 === 0 || (s16 === 10 && bar % 2 === 1) || (s16 === 7 && Math.random() < 0.2)) kick(t);
      if (s16 === 4 || s16 === 12) snare(t);
      if (s16 % 2 === 0) hat(t, s16 % 4 === 0 ? 0.22 : 0.12);
      else if (Math.random() < 0.15) hat(t, 0.08);
      step++;
      nextT += STEP;
    }
    // mood coupling
    if (lp) lp.frequency.setTargetAtTime(2600 + dl * 2400, ac.currentTime, 0.5);
    if (crackleGain) crackleGain.gain.setTargetAtTime(raining ? 0.09 : 0.04, ac.currentTime, 0.5);
    if (padGain) padGain.gain.setTargetAtTime(0.13 + (1 - dl) * 0.06, ac.currentTime, 0.5);
  }
  function toggle() {
    if (!started) init();
    if (ac.state === "suspended") ac.resume();
    if (playing) {
      if (timer) clearInterval(timer);
      timer = null;
      playing = false;
      master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
    } else {
      playing = true;
      master.gain.setTargetAtTime(vol(), ac.currentTime, 0.3);
      nextT = ac.currentTime + 0.1;
      step = 0;
      chordIdx = 3;
      timer = setInterval(schedule, 40);
    }
    return playing;
  }
  const vol = () => Math.pow(volume / 100, 1.6) * 0.9;
  /** Volume from 0 to 100. */
  function setVol(v: number) {
    volume = v;
    if (started && playing) master.gain.setTargetAtTime(vol(), ac.currentTime, 0.1);
  }
  function celebrate() {
    if (!started || !playing) return;
    const t0 = ac.currentTime + 0.1;
    const arp = [0, 7, 12, 16, 19, 24, 28, 31];
    arp.forEach((n, i) => {
      mel(t0 + i * 0.11, n, 0.5, 0.6);
      mel(t0 + 1.2 + i * 0.11, n + 3, 0.5, 0.5);
    });
    chord(t0, [0, 4, 7, 11], SPB * 8);
  }
  function stop() {
    if (timer) clearInterval(timer);
    if (started) ac.close();
  }
  return { toggle, setVol, celebrate, stop };
}
